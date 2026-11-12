"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getTier, briefingThresholds, availableWalletCents } from "@/lib/assessments";
import { internalCapCents } from "@/lib/pricing";
import { createRunWithHold } from "@/lib/wallet";
import { notify } from "@/lib/notifications";
import { reissueDeliveryCodeForBundle } from "@/lib/report-bundle";
import { checkRateLimit } from "@/lib/rate-limit";

export async function createAssessmentAction(formData: FormData) {
  const user = await requireUser();
  const limit = checkRateLimit({ key: `assessment:${user.id}`, limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) redirect("/assessments/new?error=rate");
  const domainId = String(formData.get("domainId") || "");
  const tier = getTier(String(formData.get("tier") || ""));
  const budgetUsd = Number(formData.get("budgetUsd") || 0);
  const budgetCents = Math.round(budgetUsd * 100);
  const consent = String(formData.get("consent") || "") === "on";
  if (!tier) redirect("/assessments/new?error=tier");
  if (!Number.isFinite(budgetCents) || budgetCents < tier.minBudgetCents) redirect("/assessments/new?error=budget");
  if (tier.consent && !consent) redirect("/assessments/new?error=consent");

  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  if (availableWalletCents(wallet) < budgetCents) redirect("/assessments/new?error=balance");
  const domain = await prisma.domain.findFirst({ where: { id: domainId, userId: user.id, status: "VERIFIED" } });
  if (!domain) redirect("/assessments/new?error=domain");
  if (domain.expiresAt && domain.expiresAt < new Date()) redirect("/assessments/new?error=expired");

  const run = await createRunWithHold({
    userId: user.id,
    domainId: domain.id,
    url: `https://${domain.hostname}/`,
    host: domain.hostname,
    tier: tier.id,
    mode: tier.mode,
    aggressive: tier.aggressive,
    customerBudgetCents: budgetCents,
    internalCapCents: internalCapCents(budgetCents),
  });
  await prisma.run.update({
    where: { id: run.id },
    data: { briefingPlan: { thresholds: briefingThresholds(budgetCents), version: 1 } },
  });
  await notify({
    userId: user.id,
    kind: "queued",
    title: "Assessment queued",
    body: `${domain.hostname} is in the queue. We will notify you when the swarm starts.`,
    href: `/assessments/${run.id}`,
  });
  revalidatePath("/assessments");
  revalidatePath("/dashboard");
  redirect(`/assessments/${run.id}`);
}

export async function reissueDeliveryCodeAction(formData: FormData) {
  const user = await requireUser();
  const runId = String(formData.get("runId") || "");
  const bundle = await prisma.reportBundle.findFirst({
    where: { runId, run: { userId: user.id } },
  });
  if (!bundle) redirect(`/assessments/${runId}?error=report`);
  await reissueDeliveryCodeForBundle(bundle.id, user.id);
  revalidatePath(`/assessments/${runId}`);
  redirect(`/assessments/${runId}?reissued=1`);
}
