// Windows worker service client. Claims runs over the worker API, sends metadata,
// uploads only encrypted report bytes and completes the run.
//
// This file is intentionally standalone: no database, no Next.js imports and no
// customer secrets. The scan adapter is mock by default; a real adapter can be
// plugged in at HMW_SCAN_MODE=command later.
import { createCipheriv, createHash, createPublicKey, randomBytes, publicEncrypt, constants } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const WEB = (process.env.HMW_WEB_URL || "http://localhost:3123").replace(/\/+$/, "");
const TOKEN = process.env.HMW_WORKER_TOKEN || "local-worker-token-2026";
const RUNS_DIR = process.env.HMW_RUNS_DIR || path.join(process.cwd(), "worker-runs");
const POLL_MS = Number(process.env.HMW_POLL_MS || 5_000);
const HEARTBEAT_MS = Number(process.env.HMW_HEARTBEAT_MS || 15_000);
const MOCK_SCAN_MS = Number(process.env.HMW_MOCK_SCAN_MS || 15_000);
const VERSION = "worker-service-0.1";
let stopping = false;
let sequence = 0;

function log(message, extra) {
  const suffix = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[worker] ${new Date().toISOString()} ${message}${suffix}`);
}

async function api(pathname, options = {}) {
  const response = await fetch(`${WEB}${pathname}`, {
    ...options,
    headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...(options.headers || {}) },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${options.method || "GET"} ${pathname} -> ${response.status}`);
  return body;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function buildReportHtml(run, findings) {
  const rows = findings.map((finding) => `<article class="finding ${escapeHtml(finding.severity)}"><span class="badge">${escapeHtml(finding.severity.toUpperCase())}</span><h2>${escapeHtml(finding.title)}</h2><p>${escapeHtml(finding.endpoint)}</p></article>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sealed report ${escapeHtml(run.host)}</title><style>
  body{font:15px/1.6 Arial,sans-serif;background:#f1f5f9;color:#0f172a;margin:0}main{max-width:860px;margin:0 auto;padding:36px 22px}.sheet{background:#fff;border:1px solid #e2e8f0;padding:34px}.brand{font:700 11px monospace;letter-spacing:.14em;text-transform:uppercase;color:#1d4ed8}h1{font-size:32px;margin:16px 0 6px}.meta{color:#64748b;font-size:13px}.finding{border:1px solid #e2e8f0;border-left:4px solid #94a3b8;padding:12px 14px;margin:10px 0}.finding.critical{border-left-color:#dc2626;background:#fef2f2}.finding.high{border-left-color:#ea580c;background:#fff7ed}.badge{font:700 10px monospace;border:1px solid #cbd5e1;padding:2px 6px}.finding h2{font-size:16px;margin:6px 0 0}.finding p{color:#64748b;font:11px monospace;margin:4px 0 0}.warn{border-left:4px solid #b91c1c;background:#fef2f2;color:#7f1d1d;padding:12px;margin:18px 0;font-size:13px}.foot{border-top:1px solid #e2e8f0;margin-top:28px;padding-top:12px;color:#64748b;font-size:12px}@media(max-width:600px){.sheet{padding:22px}h1{font-size:26px}}
  </style></head><body><main><div class="sheet"><p class="brand">hackmywebsite.ai / sealed report</p><h1>${escapeHtml(run.host)}</h1><p class="meta">${escapeHtml(run.tier)} · ${escapeHtml(run.id)} · ${new Date().toISOString()}</p><div class="warn">This report is sealed to your report key. Decrypt it in the portal delivery page. Support cannot read it.</div><h2>Findings</h2>${rows || "<p>No findings.</p>"}<p class="foot">Worker-generated local report. Real evidence packaging is added by the production scan adapter.</p></div></main></body></html>`;
}

function encryptReport(html, publicKeySpki) {
  const fileKey = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", fileKey, iv);
  const ciphertext = Buffer.concat([cipher.update(html, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const publicKey = createPublicKey({ key: Buffer.from(publicKeySpki, "base64"), format: "der", type: "spki" });
  const wrappedKey = publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, fileKey);
  return {
    ciphertext,
    sha256: createHash("sha256").update(ciphertext).digest("hex"),
    envelope: {
      version: 1,
      alg: "AES-256-GCM",
      keyAlg: "RSA-OAEP-256",
      wrappedKey: wrappedKey.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      filename: "hackmywebsite-report.html",
      contentType: "text/html",
      plaintextSha256: createHash("sha256").update(html, "utf8").digest("hex"),
    },
  };
}

async function postEvent(runId, type, payload) {
  sequence += 1;
  await api(`/api/worker/runs/${runId}/events`, {
    method: "POST",
    body: JSON.stringify({ events: [{ seq: sequence, type, payload }] }),
  });
}

async function runMockScan(runId) {
  const findings = [
    { title: "Missing access-control check on a customer object", severity: "critical", endpoint: "/api/records/1005" },
    { title: "Session token signature is not verified", severity: "critical", endpoint: "/api/session" },
    { title: "Internal fetch through the avatar URL parameter", severity: "high", endpoint: "/api/avatar?url=" },
    { title: "Private file readable by another account", severity: "high", endpoint: "/api/files/1001" },
  ];
  await postEvent(runId, "thought", { agent: "mapper", text: "I mapped the public surface and found the first object route.", important: false, tag: "surface" });
  await new Promise((resolve) => setTimeout(resolve, MOCK_SCAN_MS / 2));
  await postEvent(runId, "thought", { agent: "chain", text: "The object read and the weak session check may compose into a chain.", important: true, tag: "chain" });
  await new Promise((resolve) => setTimeout(resolve, MOCK_SCAN_MS / 2));
  await postEvent(runId, "thought", { agent: "reporter", text: "Evidence captured. Sealing the report now.", important: false, tag: "evidence" });
  return findings;
}

async function processRun(claim) {
  const run = claim.run;
  const runDir = path.join(RUNS_DIR, run.id);
  await fs.mkdir(runDir, { recursive: true });
  log("claimed", { run: run.id, host: run.host, tier: run.tier });

  let cancelled = false;
  let heartbeatError = null;
  const heartbeat = setInterval(async () => {
    try {
      await api(`/api/worker/runs/${run.id}/heartbeat`, {
        method: "POST",
        body: JSON.stringify({ version: VERSION }),
      });
      const control = await api(`/api/worker/runs/${run.id}/control`);
      if (control.cancelRequested) cancelled = true;
    } catch (error) {
      heartbeatError = error instanceof Error ? error.message : String(error);
    }
  }, HEARTBEAT_MS);

  try {
    await api(`/api/worker/runs/${run.id}/heartbeat`, {
      method: "POST",
      body: JSON.stringify({ version: VERSION }),
    });
    if (!claim.reportKey?.publicKeySpki) throw new Error("No report key configured for the customer");

    const findings = await runMockScan(run.id);
    if (cancelled) throw new Error("cancelled");
    if (heartbeatError) throw new Error(`heartbeat failed: ${heartbeatError}`);

    const html = buildReportHtml(run, findings);
    const encrypted = encryptReport(html, claim.reportKey.publicKeySpki);
    await api(`/api/worker/runs/${run.id}/upload`, {
      method: "POST",
      body: JSON.stringify({
        keyId: claim.reportKey.keyId,
        sha256: encrypted.sha256,
        ciphertext: encrypted.ciphertext.toString("base64"),
        envelope: encrypted.envelope,
      }),
    });
    await api(`/api/worker/runs/${run.id}/complete`, {
      method: "POST",
      body: JSON.stringify({
        status: "COMPLETE",
        internalCostCents: Math.round(run.customerBudgetCents / 12.5),
        chargedCents: Math.round(run.customerBudgetCents * 0.75),
        coverage: { routesProbed: 12, injectionTests: 2 },
        findings,
      }),
    });
    log("completed", { run: run.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("failed", { run: run.id, error: message });
    await api(`/api/worker/runs/${run.id}/complete`, {
      method: "POST",
      body: JSON.stringify({ status: cancelled ? "CANCELLED" : "FAILED", internalCostCents: 0, chargedCents: 0, error: message }),
    }).catch((completeError) => log("completion failed", { run: run.id, error: completeError.message }));
  } finally {
    clearInterval(heartbeat);
    await fs.rm(runDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function loop() {
  log("started", { web: WEB, runs: RUNS_DIR });
  while (!stopping) {
    let claim = null;
    try {
      claim = await api("/api/worker/claim", { method: "POST", body: "{}" });
    } catch (error) {
      log("claim failed", { error: error instanceof Error ? error.message : String(error) });
    }
    if (claim?.run) {
      await processRun(claim);
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  log("stopped");
}

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
await loop();
