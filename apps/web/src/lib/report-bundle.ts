import { createCipheriv, createHash, createPublicKey, randomBytes, randomUUID, publicEncrypt, constants } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { notify, emailShell } from "@/lib/notifications";
import { processEmailOutbox } from "@/lib/email-sender";
import { formatUsd } from "@/lib/pricing";
import {
  assertStoragePath,
  createDeliveryCode,
  createDeliveryToken,
  hashDeliveryCode,
  hashDeliveryToken,
  reportStorageRoot,
} from "@/lib/report-delivery";

const REPORT_FILENAME = "hackmywebsite-report.html";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function severityClass(severity: string | undefined) {
  if (severity === "critical") return "critical";
  if (severity === "high") return "high";
  if (severity === "medium") return "medium";
  return "low";
}

function buildReportHtml(run: {
  id: string;
  host: string;
  url: string;
  tier: string;
  status: string;
  customerBudgetCents: number;
  chargedCents: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  findings: unknown;
  briefings: Array<{
    seq: number;
    thresholdPct: number;
    title: string;
    summary: string | null;
    findings: unknown;
    createdAt: Date;
  }>;
}) {
  const findings = Array.isArray(run.findings)
    ? (run.findings as Array<{ title?: string; severity?: string; endpoint?: string; status?: string }>)
    : [];
  const findingRows = findings.length
    ? findings.map((finding) => `
      <article class="finding ${severityClass(finding.severity)}">
        <div class="finding-head">
          <span class="badge ${severityClass(finding.severity)}">${escapeHtml((finding.severity || "info").toUpperCase())}</span>
          <h2>${escapeHtml(finding.title || "Untitled finding")}</h2>
        </div>
        <p class="endpoint">${escapeHtml(finding.endpoint || "Endpoint not recorded")}</p>
        <p class="status">${escapeHtml(finding.status || "confirmed")}</p>
      </article>`).join("")
    : `<p class="empty">No findings were recorded for this run.</p>`;
  const briefingRows = run.briefings.length
    ? run.briefings.map((briefing) => `
      <section class="briefing">
        <div class="briefing-head"><h2>${escapeHtml(briefing.title)}</h2><span>${briefing.thresholdPct}% threshold</span></div>
        <p>${escapeHtml(briefing.summary || "")}</p>
        <p class="time">${escapeHtml(briefing.createdAt.toLocaleString("en-GB"))}</p>
      </section>`).join("")
    : `<p class="empty">No interim briefings were published.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sealed assessment report | ${escapeHtml(run.host)}</title>
<style>
  :root { color-scheme: light; --ink: #0f172a; --muted: #64748b; --line: #e2e8f0; --blue: #1d4ed8; --red: #b91c1c; --soft: #f8fafc; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f1f5f9; color: var(--ink); font: 15px/1.65 Arial, Helvetica, sans-serif; }
  main { max-width: 880px; margin: 0 auto; padding: 40px 24px 64px; }
  .sheet { background: #fff; border: 1px solid var(--line); padding: 38px; }
  .brand { font: 700 11px/1.2 monospace; letter-spacing: .14em; text-transform: uppercase; color: var(--blue); }
  h1 { font-size: 34px; line-height: 1.15; letter-spacing: -.03em; margin: 18px 0 8px; }
  .meta { color: var(--muted); font-size: 13px; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 28px 0; }
  .summary div { border: 1px solid var(--line); padding: 12px; background: var(--soft); }
  .summary b { display: block; font: 600 10px/1.2 monospace; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
  .summary span { font-weight: 700; }
  h2 { font-size: 16px; margin: 0; }
  .section-title { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid var(--line); padding-bottom: 10px; margin: 32px 0 14px; }
  .section-title p { margin: 0; color: var(--muted); font-size: 12px; }
  .finding { border-left: 4px solid #94a3b8; border: 1px solid var(--line); padding: 14px 16px; margin: 0 0 10px; background: #fff; }
  .finding.critical { border-left-color: #dc2626; background: #fef2f2; }
  .finding.high { border-left-color: #ea580c; background: #fff7ed; }
  .finding.medium { border-left-color: #d97706; }
  .finding-head { display: flex; gap: 10px; align-items: flex-start; }
  .badge { flex: 0 0 auto; border: 1px solid var(--line); background: var(--soft); padding: 2px 6px; font: 700 10px/1.5 monospace; letter-spacing: .06em; }
  .badge.critical { color: #991b1b; border-color: #fca5a5; background: #fee2e2; }
  .badge.high { color: #9a3412; border-color: #fdba74; background: #ffedd5; }
  .endpoint { font: 11px/1.5 monospace; color: var(--blue); margin: 8px 0 0; word-break: break-all; }
  .status { margin: 4px 0 0; color: var(--muted); font-size: 11px; }
  .briefing { border: 1px solid var(--line); padding: 14px 16px; margin: 0 0 10px; }
  .briefing-head { display: flex; justify-content: space-between; gap: 12px; }
  .briefing-head span { color: var(--muted); font: 10px/1.5 monospace; text-transform: uppercase; }
  .briefing p { margin: 8px 0 0; }
  .time { color: var(--muted); font-size: 11px; }
  .empty { color: var(--muted); }
  .foot { border-top: 1px solid var(--line); margin-top: 34px; padding-top: 14px; color: var(--muted); font-size: 12px; }
  .warn { border-left: 4px solid var(--red); background: #fef2f2; padding: 12px 14px; margin-top: 26px; color: #7f1d1d; font-size: 13px; }
  @media (max-width: 640px) { .sheet { padding: 24px 18px; } .summary { grid-template-columns: 1fr 1fr; } h1 { font-size: 27px; } }
</style>
</head>
<body>
<main>
  <div class="sheet">
    <p class="brand">hackmywebsite.ai / sealed assessment report</p>
    <h1>${escapeHtml(run.host)}</h1>
    <p class="meta">${escapeHtml(run.url)} · ${escapeHtml(run.tier)} · ${escapeHtml(run.status)}<br>Run ${escapeHtml(run.id)} · ${escapeHtml((run.finishedAt || run.startedAt || new Date()).toLocaleString("en-GB"))}</p>
    <div class="summary">
      <div><b>Budget cap</b><span>${formatUsd(run.customerBudgetCents)}</span></div>
      <div><b>Charged</b><span>${formatUsd(run.chargedCents)}</span></div>
      <div><b>Findings</b><span>${findings.length}</span></div>
      <div><b>Briefings</b><span>${run.briefings.length}</span></div>
    </div>
    <div class="warn">This report is sealed to your report key. The server stores ciphertext only. Decrypt it in the delivery page with your passphrase. Never share the passphrase with support.</div>
    <div class="section-title"><h2>Findings</h2><p>Current assessment snapshot</p></div>
    ${findingRows}
    <div class="section-title"><h2>Interim briefings</h2><p>Published during the run</p></div>
    ${briefingRows}
    <p class="foot">Generated by hackmywebsite.ai. Only the owner of the verified domain should use this report. Raw evidence and the full bundle are delivered separately by the worker in production.</p>
  </div>
</main>
</body>
</html>`;
}

function encryptReport(html: string, publicKeySpki: string) {
  const fileKey = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", fileKey, iv);
  const ciphertext = Buffer.concat([cipher.update(html, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const publicKey = createPublicKey({
    key: Buffer.from(publicKeySpki, "base64"),
    format: "der",
    type: "spki",
  });
  const wrappedKey = publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    fileKey,
  );
  return {
    ciphertext,
    envelope: {
      version: 1,
      alg: "AES-256-GCM",
      keyAlg: "RSA-OAEP-256",
      wrappedKey: wrappedKey.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      filename: REPORT_FILENAME,
      contentType: "text/html",
      plaintextSha256: createHash("sha256").update(html, "utf8").digest("hex"),
    },
    sha256: createHash("sha256").update(ciphertext).digest("hex"),
  };
}

export async function createReportBundleForRun(runId: string) {
  const existing = await prisma.reportBundle.findUnique({ where: { runId } });
  if (existing) return { status: "exists" as const, bundleId: existing.id };

  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { briefings: { orderBy: { seq: "asc" } }, user: true, domain: true },
  });
  if (!run || !["COMPLETE", "PARTIAL"].includes(run.status)) return { status: "not-ready" as const };

  const key = await prisma.userKey.findFirst({
    where: { userId: run.userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!key?.encryptedPrivateKey || !key.kdfSalt || !key.kdfIters) {
    await notify({
      userId: run.userId,
      kind: "report_key",
      title: "Set a report passphrase",
      body: `The assessment for ${run.host} is complete. Set a report passphrase so the sealed bundle can be delivered.`,
      href: "/report-key",
    });
    return { status: "no-key" as const };
  }

  const html = buildReportHtml(run);
  const encrypted = encryptReport(html, key.publicKeySpki);
  const bundleId = `report_${randomUUID()}`;
  const root = reportStorageRoot();
  await fs.mkdir(root, { recursive: true });
  const storageKey = assertStoragePath(path.join(root, `${bundleId}.bin`));
  await fs.writeFile(storageKey, encrypted.ciphertext, { mode: 0o600 });

  try {
    const bundle = await prisma.reportBundle.create({
      data: {
        id: bundleId,
        runId: run.id,
        keyId: key.keyId,
        storageKey,
        envelope: encrypted.envelope,
        sha256: encrypted.sha256,
        bytes: encrypted.ciphertext.length,
        plaintextDeletedAt: new Date(),
      },
    });
    const delivery = await createDeliveryForBundle(bundle.id);
    return { status: "ok" as const, bundleId: bundle.id, token: delivery.token };
  } catch (error) {
    await fs.unlink(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function createDeliveryForBundle(bundleId: string) {
  return issueDeliveryCodeForBundle(bundleId, { force: false });
}

export async function reissueDeliveryCodeForBundle(bundleId: string, userId: string) {
  const bundle = await prisma.reportBundle.findUnique({
    where: { id: bundleId },
    include: { run: true },
  });
  if (!bundle || bundle.run.userId !== userId) return { status: "missing" as const, token: null };
  const result = await issueDeliveryCodeForBundle(bundleId, { force: true });
  await prisma.auditLog.create({
    data: {
      userId,
      actor: "customer",
      action: "delivery.reissue",
      target: bundleId,
      meta: { runId: bundle.runId },
    },
  });
  return result;
}

async function issueDeliveryCodeForBundle(bundleId: string, options: { force: boolean }) {
  const bundle = await prisma.reportBundle.findUnique({
    where: { id: bundleId },
    include: { run: { include: { user: true } } },
  });
  if (!bundle) return { status: "missing" as const, token: null };
  const existing = await prisma.deliveryCode.findFirst({ where: { bundleId }, orderBy: { createdAt: "desc" } });
  if (existing && !options.force) return { status: "exists" as const, token: null };
  if (existing && options.force) {
    await prisma.deliveryCode.updateMany({
      where: { bundleId, lockedAt: null },
      data: { lockedAt: new Date() },
    });
  }

  const run = bundle.run;
  const code = createDeliveryCode();
  const token = createDeliveryToken();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3123";
  const deliveryUrl = `${baseUrl}/delivery/${token}`;

  await prisma.deliveryCode.create({
    data: {
      bundleId: bundle.id,
      userId: run.userId,
      codeHmac: hashDeliveryCode(code),
      tokenHash: hashDeliveryToken(token),
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    },
  });
  await notify({
    userId: run.userId,
    kind: "report_ready",
    title: `${options.force ? "New delivery code" : "Sealed report ready"} for ${run.host}`,
    body: `Run ${run.id} is sealed. Use the 48-hour code sent by email, then decrypt with your report passphrase.`,
    href: `/delivery/${token}`,
  });
  if (run.user.email) {
    await prisma.emailOutbox.create({
      data: {
        userId: run.userId,
        kind: "report_ready",
        toAddress: run.user.email,
        subject: `${options.force ? "New delivery code" : "Sealed report ready"} for ${run.host}`,
        html: emailShell(
          options.force ? "A new delivery code is ready" : "Your sealed report is ready",
          `The assessment for <strong>${escapeHtml(run.host)}</strong> is sealed. Your 48-hour code is <strong>${escapeHtml(code)}</strong>. Open the delivery page and decrypt with your report passphrase.`,
          deliveryUrl,
        ),
        text: `Your sealed report for ${run.host} is ready.\n\n48-hour code: ${code}\nDelivery page: ${deliveryUrl}\n\nYou will need your report passphrase to decrypt it. Do not share it with support.`,
      },
    });
  }
  await processEmailOutbox(10).catch((error) => console.error("[email] report delivery", error));
  return { status: "ok" as const, token };
}
