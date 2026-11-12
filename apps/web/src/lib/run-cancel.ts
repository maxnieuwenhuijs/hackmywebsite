import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";

async function releaseHold(tx: Prisma.TransactionClient, runId: string) {
  const run = await tx.run.findUnique({ where: { id: runId } });
  if (!run) return null;
  const wallet = await tx.wallet.findUnique({ where: { userId: run.userId } });
  if (!wallet) return run;
  const charged = Math.min(run.chargedCents, wallet.balanceCents);
  const held = Math.max(0, wallet.heldCents - run.customerBudgetCents);
  const balance = Math.max(0, wallet.balanceCents - charged);
  await tx.wallet.update({ where: { userId: run.userId }, data: { heldCents: held, balanceCents: balance } });
  if (charged > 0) {
    await tx.ledgerEntry.create({
      data: {
        userId: run.userId,
        runId,
        kind: "CHARGE",
        amountCents: -charged,
        balanceAfterCents: balance - held,
        meta: { reason: "cancelled", chargedCents: charged },
      },
    });
  }
  await tx.ledgerEntry.create({
    data: {
      userId: run.userId,
      runId,
      kind: "RELEASE",
      amountCents: 0,
      balanceAfterCents: balance - held,
      meta: { reason: "cancelled" },
    },
  });
  return run;
}

export async function finalizeCancelledRun(runId: string) {
  let wasActive = false;
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.run.findUnique({ where: { id: runId } });
    if (!current) return null;
    if (!["QUEUED", "RUNNING", "REPORTING"].includes(current.status)) return current;
    wasActive = true;
    await releaseHold(tx, runId);
    await tx.egressAssignment.updateMany({
      where: { runId, releasedAt: null },
      data: { status: "OFFLINE", releasedAt: new Date() },
    });
    return tx.run.update({
      where: { id: runId },
      data: {
        status: "CANCELLED",
        cancelRequested: true,
        finishedAt: new Date(),
        leaseExpiresAt: null,
        heartbeatAt: new Date(),
      },
    });
  });
  if (result && wasActive) {
    await notify({
      userId: result.userId,
      kind: "cancelled",
      title: `Assessment cancelled for ${result.host}`,
      body: "The run was cancelled. Work completed before cancellation was charged and the remaining hold was released.",
      href: `/assessments/${result.id}`,
    });
  }
  return result;
}

export async function requestRunCancellation(runId: string, actor: string) {
  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run) return { status: "missing" as const };
  if (!["QUEUED", "RUNNING", "REPORTING"].includes(run.status)) return { status: "not-active" as const };
  if (run.status === "QUEUED") {
    const finalized = await finalizeCancelledRun(runId);
    await prisma.auditLog.create({
      data: { actor, action: "run.cancel", target: runId, meta: { previousStatus: run.status } },
    });
    return { status: "cancelled" as const, run: finalized };
  }
  const updated = await prisma.run.update({
    where: { id: runId },
    data: { cancelRequested: true },
  });
  await prisma.auditLog.create({
    data: { actor, action: "run.cancel_requested", target: runId, meta: { previousStatus: run.status } },
  });
  await notify({
    userId: run.userId,
    kind: "cancel_requested",
    title: `Cancellation requested for ${run.host}`,
    body: "The worker is stopping between steps. Work completed so far may be charged; the remaining hold will be released when it confirms.",
    href: `/assessments/${run.id}`,
  });
  return { status: "requested" as const, run: updated };
}
