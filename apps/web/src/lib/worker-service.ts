import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import {
  assertStoragePath,
  reportStorageRoot,
} from "@/lib/report-delivery";
import { createDeliveryForBundle } from "@/lib/report-bundle";

const LEASE_MS = 10 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

export async function claimNextRun(worker: { id: string }) {
  const now = new Date();
  await prisma.run.updateMany({
    where: { status: "RUNNING", leaseExpiresAt: { lt: now } },
    data: { status: "QUEUED", workerId: null, leaseExpiresAt: null },
  });

  const candidate = await prisma.run.findFirst({
    where: { status: "QUEUED" },
    orderBy: { queuedAt: "asc" },
  });
  if (!candidate) {
    await prisma.worker.update({ where: { id: worker.id }, data: { status: "ONLINE", lastSeenAt: now } });
    return null;
  }

  const claimed = await prisma.run.updateMany({
    where: { id: candidate.id, status: "QUEUED" },
    data: {
      status: "RUNNING",
      workerId: worker.id,
      startedAt: candidate.startedAt || now,
      heartbeatAt: now,
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
    },
  });
  if (claimed.count === 0) return null;

  const run = await prisma.run.findUnique({
    where: { id: candidate.id },
    include: { domain: true },
  });
  if (!run) return null;
  const key = await prisma.userKey.findFirst({
    where: { userId: run.userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  await notify({
    userId: run.userId,
    kind: "started",
    title: "Your assessment started",
    body: `The swarm is now working on ${run.host}. You will get live briefings at the budget thresholds.`,
    href: `/assessments/${run.id}`,
  });

  return {
    run: {
      id: run.id,
      url: run.url,
      host: run.host,
      tier: run.tier,
      mode: run.mode,
      engine: run.engine,
      language: run.language,
      status: run.status,
      customerBudgetCents: run.customerBudgetCents,
      internalCapCents: run.internalCapCents,
      briefingPlan: run.briefingPlan,
      queuedAt: run.queuedAt.toISOString(),
      startedAt: run.startedAt?.toISOString() || null,
    },
    domain: {
      hostname: run.domain.hostname,
      verifiedAt: run.domain.verifiedAt?.toISOString() || null,
      expiresAt: run.domain.expiresAt?.toISOString() || null,
    },
    reportKey: key ? { keyId: key.keyId, publicKeySpki: key.publicKeySpki } : null,
    leaseExpiresAt: new Date(now.getTime() + LEASE_MS).toISOString(),
  };
}

async function ownedRun(workerId: string, runId: string) {
  return prisma.run.findFirst({ where: { id: runId, workerId } });
}

export async function heartbeatRun(workerId: string, runId: string, body: { version?: string; egressIp?: string; egressRange?: string }) {
  const run = await ownedRun(workerId, runId);
  if (!run) return null;
  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.run.update({
      where: { id: runId },
      data: {
        heartbeatAt: now,
        leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
        ...(body.egressIp ? { egressIp: body.egressIp } : {}),
        ...(body.egressRange ? { egressRange: body.egressRange } : {}),
      },
    }),
    prisma.worker.update({
      where: { id: workerId },
      data: { lastSeenAt: now, status: "ONLINE", ...(body.version ? { version: body.version } : {}) },
    }),
  ]);
  return { status: updated.status, leaseExpiresAt: nowIso(), heartbeatAt: updated.heartbeatAt?.toISOString() || nowIso() };
}

export async function appendRunEvents(workerId: string, runId: string, body: { events?: unknown }) {
  const run = await ownedRun(workerId, runId);
  if (!run) return null;
  if (!Array.isArray(body.events) || body.events.length > 200) {
    throw new Error("Invalid event batch");
  }
  const valid = [];
  for (const raw of body.events) {
    if (!raw || typeof raw !== "object") throw new Error("Invalid event");
    const event = raw as { seq?: unknown; type?: unknown; payload?: unknown };
    const seq = Number(event.seq);
    const type = String(event.type || "");
    if (!Number.isInteger(seq) || seq < 1 || !type || type.length > 50) throw new Error("Invalid event shape");
    if (!event.payload || typeof event.payload !== "object") throw new Error("Invalid event payload");
    if (JSON.stringify(event.payload).length > 12_000) throw new Error("Event payload too large");
    valid.push({ runId, seq, type, payload: event.payload as object });
  }
  if (!valid.length) return { accepted: 0 };
  await prisma.runEvent.createMany({ data: valid, skipDuplicates: true });
  await prisma.run.update({ where: { id: runId }, data: { heartbeatAt: new Date(), leaseExpiresAt: new Date(Date.now() + LEASE_MS) } });
  return { accepted: valid.length };
}

export async function getRunControl(workerId: string, runId: string) {
  const run = await ownedRun(workerId, runId);
  if (!run) return null;
  return { cancelRequested: run.cancelRequested };
}

export async function uploadReportBundle(workerId: string, runId: string, body: {
  keyId?: unknown;
  envelope?: unknown;
  ciphertext?: unknown;
  sha256?: unknown;
}) {
  const run = await prisma.run.findFirst({ where: { id: runId, workerId } });
  if (!run) return null;
  if (await prisma.reportBundle.findUnique({ where: { runId } })) {
    throw new Error("Bundle already uploaded");
  }
  if (!["RUNNING", "REPORTING"].includes(run.status)) throw new Error("Run is not accepting a bundle");

  const keyId = String(body.keyId || "");
  const key = await prisma.userKey.findFirst({ where: { keyId, userId: run.userId, revokedAt: null } });
  if (!key) throw new Error("Report key not found for this run");

  const envelope = body.envelope as Record<string, unknown> | undefined;
  const required = ["wrappedKey", "iv", "tag", "filename", "contentType", "plaintextSha256"];
  if (!envelope || typeof envelope !== "object" || required.some((field) => typeof envelope[field] !== "string")) {
    throw new Error("Invalid envelope");
  }
  const ciphertextBase64 = String(body.ciphertext || "");
  if (!/^[A-Za-z0-9+/=]+$/.test(ciphertextBase64)) throw new Error("Invalid ciphertext");
  const ciphertext = Buffer.from(ciphertextBase64, "base64");
  if (ciphertext.length < 32 || ciphertext.length > 25 * 1024 * 1024) throw new Error("Bundle size is out of range");
  const sha256 = createHash("sha256").update(ciphertext).digest("hex");
  if (String(body.sha256 || "") !== sha256) throw new Error("Ciphertext hash mismatch");

  const bundleId = `report_${randomUUID()}`;
  const root = reportStorageRoot();
  await fs.mkdir(root, { recursive: true });
  const storageKey = assertStoragePath(path.join(root, `${bundleId}.bin`));
  await fs.writeFile(storageKey, ciphertext, { mode: 0o600 });
  try {
    const bundle = await prisma.reportBundle.create({
      data: {
        id: bundleId,
        runId,
        keyId,
        storageKey,
        envelope: envelope as object,
        sha256,
        bytes: ciphertext.length,
        plaintextDeletedAt: new Date(),
      },
    });
    await prisma.run.update({ where: { id: runId }, data: { status: "REPORTING" } });
    return { bundleId: bundle.id, bytes: bundle.bytes };
  } catch (error) {
    await fs.unlink(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function completeRun(workerId: string, runId: string, body: {
  status?: unknown;
  internalCostCents?: unknown;
  chargedCents?: unknown;
  coverage?: unknown;
  findings?: unknown;
  error?: unknown;
}) {
  const run = await prisma.run.findFirst({ where: { id: runId, workerId } });
  if (!run) return null;
  const status = String(body.status || "").toUpperCase();
  if (!["COMPLETE", "PARTIAL", "FAILED", "CANCELLED"].includes(status)) throw new Error("Invalid run status");
  if (!["RUNNING", "REPORTING"].includes(run.status)) throw new Error("Run is not active");

  const requestedCharge = Number(body.chargedCents || 0);
  const charged = status === "COMPLETE" || status === "PARTIAL"
    ? Math.max(0, Math.min(run.customerBudgetCents, Math.round(requestedCharge)))
    : 0;
  const internalCost = Math.max(0, Math.round(Number(body.internalCostCents || 0)));
  const findings = Array.isArray(body.findings) ? body.findings : undefined;
  const coverage = body.coverage && typeof body.coverage === "object" ? body.coverage : undefined;
  const finishedAt = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.run.findUniqueOrThrow({ where: { id: runId } });
    if (!["RUNNING", "REPORTING"].includes(current.status)) throw new Error("Run is not active");
    const wallet = await tx.wallet.findUnique({ where: { userId: current.userId } });
    if (wallet) {
      const held = Math.max(0, wallet.heldCents - current.customerBudgetCents);
      const balance = Math.max(0, wallet.balanceCents - charged);
      await tx.wallet.update({ where: { userId: current.userId }, data: { heldCents: held, balanceCents: balance } });
      if (charged > 0) {
        await tx.ledgerEntry.create({
          data: {
            userId: current.userId,
            runId: current.id,
            kind: "CHARGE",
            amountCents: -charged,
            balanceAfterCents: balance - held,
            meta: { source: "worker", internalCostCents: internalCost },
          },
        });
      }
    }
    return tx.run.update({
      where: { id: runId },
      data: {
        status: status as "COMPLETE" | "PARTIAL" | "FAILED" | "CANCELLED",
        chargedCents: charged,
        internalCostCents: internalCost,
        ...(findings ? { findings } : {}),
        ...(coverage ? { coverage } : {}),
        finishedAt,
        heartbeatAt: finishedAt,
        leaseExpiresAt: null,
        ...(typeof body.error === "string" ? { error: body.error.slice(0, 4000) } : {}),
      },
    });
  });

  const bundle = await prisma.reportBundle.findUnique({ where: { runId } });
  if (bundle && (status === "COMPLETE" || status === "PARTIAL")) {
    await createDeliveryForBundle(bundle.id).catch((error) => console.error("[worker] delivery", error));
  }
  await notify({
    userId: run.userId,
    kind: status === "COMPLETE" || status === "PARTIAL" ? "complete" : "failed",
    title: status === "COMPLETE" || status === "PARTIAL" ? `Run finished for ${run.host}` : `Run ended for ${run.host}`,
    body: status === "COMPLETE" || status === "PARTIAL"
      ? "The assessment is complete. The sealed report is ready for delivery."
      : "The run ended before a report was sealed. The remaining hold was released.",
    href: `/assessments/${run.id}`,
  });
  return { status: result.status, chargedCents: result.chargedCents, bundleId: bundle?.id || null };
}
