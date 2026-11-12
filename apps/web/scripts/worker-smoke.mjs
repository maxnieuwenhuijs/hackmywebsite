// worker-smoke.mjs - exercise the worker API against one queued run.
// Usage: node --env-file=.env.local scripts/worker-smoke.mjs
import { createCipheriv, createHash, createPublicKey, randomBytes, publicEncrypt, constants } from "node:crypto";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

const base = process.env.WORKER_SMOKE_URL || "http://localhost:3123";
const token = process.env.WORKER_TOKEN || "local-worker-token-2026";
const auth = { Authorization: `Bearer ${token}` };

async function api(pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, {
    ...options,
    headers: { ...auth, "content-type": "application/json", ...(options.headers || {}) },
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) throw new Error(`${options.method || "GET"} ${pathname} -> ${response.status}: ${text.slice(0, 300)}`);
  return body;
}

const claim = await api("/api/worker/claim", { method: "POST", body: "{}" });
if (!claim.run) {
  console.log("No queued run. Queue one in the portal first.");
  process.exit(0);
}
const run = claim.run;
console.log(JSON.stringify({ claimed: run.id, host: run.host, tier: run.tier, reportKey: Boolean(claim.reportKey) }, null, 2));

await api(`/api/worker/runs/${run.id}/heartbeat`, {
  method: "POST",
  body: JSON.stringify({ version: "smoke-1", egressIp: "203.0.113.10", egressRange: "203.0.113.0/28" }),
});
await api(`/api/worker/runs/${run.id}/events`, {
  method: "POST",
  body: JSON.stringify({ events: [{ seq: 1, type: "thought", payload: { agent: "mapper", text: "Smoke test note.", important: false, tag: "smoke" } }] }),
});
const control = await api(`/api/worker/runs/${run.id}/control`, { method: "GET" });
if (control.cancelRequested) throw new Error("Run was cancelled before upload");
if (!claim.reportKey?.publicKeySpki) throw new Error("No report key for the run owner");

const html = `<!doctype html><html><body><h1>Worker smoke report</h1><p>${run.host}</p></body></html>`;
const fileKey = randomBytes(32);
const iv = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", fileKey, iv);
const ciphertext = Buffer.concat([cipher.update(html, "utf8"), cipher.final()]);
const tag = cipher.getAuthTag();
const publicKey = createPublicKey({ key: Buffer.from(claim.reportKey.publicKeySpki, "base64"), format: "der", type: "spki" });
const wrappedKey = publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, fileKey);
const sha256 = createHash("sha256").update(ciphertext).digest("hex");
const upload = await api(`/api/worker/runs/${run.id}/upload`, {
  method: "POST",
  body: JSON.stringify({
    keyId: claim.reportKey.keyId,
    ciphertext: ciphertext.toString("base64"),
    sha256,
    envelope: {
      version: 1,
      alg: "AES-256-GCM",
      keyAlg: "RSA-OAEP-256",
      wrappedKey: wrappedKey.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      filename: "worker-smoke.html",
      contentType: "text/html",
      plaintextSha256: createHash("sha256").update(html, "utf8").digest("hex"),
    },
  }),
});
console.log(JSON.stringify({ uploaded: upload.bundleId, bytes: upload.bytes }, null, 2));

const complete = await api(`/api/worker/runs/${run.id}/complete`, {
  method: "POST",
  body: JSON.stringify({
    status: "COMPLETE",
    internalCostCents: 400,
    chargedCents: run.customerBudgetCents,
    coverage: { routesProbed: 12, injectionTests: 3 },
    findings: [{ title: "Smoke finding", severity: "high", status: "confirmed", endpoint: "/smoke" }],
  }),
});
console.log(JSON.stringify({ completed: complete }, null, 2));

const url = new URL(process.env.DATABASE_URL || "mysql://hmw:hmwpass@127.0.0.1:3308/hmw");
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  }),
});
const final = await prisma.run.findUnique({ where: { id: run.id }, include: { bundle: true } });
const delivery = await prisma.notification.findFirst({ where: { userId: final.userId, kind: "report_ready", body: { contains: run.id } }, orderBy: { createdAt: "desc" } });
console.log(JSON.stringify({ runStatus: final.status, chargedCents: final.chargedCents, bundleId: final.bundle?.id, deliveryLink: delivery?.href || null }, null, 2));
await prisma.$disconnect();
