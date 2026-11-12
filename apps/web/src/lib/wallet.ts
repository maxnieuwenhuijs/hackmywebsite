import { prisma } from "@/lib/db";
import { availableWalletCents } from "@/lib/assessments";

export async function ensureWallet(userId: string) {
  return prisma.wallet.upsert({
    where: { userId },
    update: {},
    create: { userId, balanceCents: 0 },
  });
}

export async function creditTopup(input: {
  userId: string;
  cents: number;
  provider: string;
  providerId: string;
  meta?: Record<string, unknown>;
}) {
  if (!Number.isInteger(input.cents) || input.cents < 5_000) throw new Error("Minimum top-up is $50");
  await ensureWallet(input.userId);
  const existing = await prisma.payment.findUnique({ where: { providerId: input.providerId } });
  if (existing?.status === "PAID") return existing;
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: input.userId } });
    const payment = existing
      ? await tx.payment.update({ where: { id: existing.id }, data: { status: "PAID", raw: input.meta as object } })
      : await tx.payment.create({
          data: {
            userId: input.userId,
            provider: input.provider,
            providerId: input.providerId,
            amountCents: input.cents,
            status: "PAID",
            raw: input.meta as object,
          },
        });
    await tx.creditLot.create({
      data: {
        userId: input.userId,
        cents: input.cents,
        remainingCents: input.cents,
        source: input.provider,
        expiresAt: new Date(Date.now() + 42 * 24 * 60 * 60 * 1000),
      },
    });
    const balance = wallet.balanceCents + input.cents;
    await tx.wallet.update({ where: { userId: input.userId }, data: { balanceCents: balance } });
    await tx.ledgerEntry.create({
      data: {
        userId: input.userId,
        kind: "TOPUP",
        amountCents: input.cents,
        balanceAfterCents: balance - wallet.heldCents,
        meta: { paymentId: payment.id, provider: input.provider },
      },
    });
    return tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
  });
}

export async function topUpDev(userId: string, cents: number) {
  return creditTopup({
    userId,
    cents,
    provider: "dev",
    providerId: `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    meta: { mode: "local" },
  });
}

export async function createRunWithHold(input: {
  userId: string;
  domainId: string;
  url: string;
  host: string;
  tier: "RECON" | "PENTEST" | "DEEP";
  mode: "RECON" | "PENTEST";
  aggressive: boolean;
  customerBudgetCents: number;
  internalCapCents: number;
}) {
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { userId: input.userId } });
    const available = availableWalletCents(wallet);
    if (available < input.customerBudgetCents) throw new Error("Insufficient balance");
    const domain = await tx.domain.findFirst({
      where: { id: input.domainId, userId: input.userId, status: "VERIFIED" },
    });
    if (!domain) throw new Error("Domain is not verified");
    if (domain.expiresAt && domain.expiresAt < new Date()) throw new Error("Domain verification expired");
    if (domain.hostname !== input.host && domain.hostname !== `www.${input.host}` && `www.${domain.hostname}` !== input.host) {
      throw new Error("Target does not match verified domain");
    }
    const run = await tx.run.create({
      data: {
        userId: input.userId,
        domainId: domain.id,
        url: input.url,
        host: input.host,
        tier: input.tier,
        mode: input.mode,
        engine: "SWARM",
        status: "QUEUED",
        customerBudgetCents: input.customerBudgetCents,
        internalCapCents: input.internalCapCents,
        language: "en",
        briefingPlan: {},
      },
    });
    await tx.wallet.update({
      where: { userId: input.userId },
      data: { heldCents: { increment: input.customerBudgetCents } },
    });
    await tx.ledgerEntry.create({
      data: {
        userId: input.userId,
        runId: run.id,
        kind: "HOLD",
        amountCents: -input.customerBudgetCents,
        balanceAfterCents: available - input.customerBudgetCents,
        meta: { tier: input.tier, budgetCents: input.customerBudgetCents },
      },
    });
    return run;
  });
}
