"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { topUpDev } from "@/lib/wallet";
import { createStripeTopup, stripeEnabled } from "@/lib/stripe-payments";
import { notify } from "@/lib/notifications";
import { formatUsd } from "@/lib/pricing";
import { checkRateLimit } from "@/lib/rate-limit";

export async function topUpAction(formData: FormData) {
  const user = await requireUser();
  const limit = checkRateLimit({ key: `topup:${user.id}`, limit: 10, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) redirect("/wallet?error=rate");
  const presetCents = Number(formData.get("amountCents") || 0);
  const customUsd = Number(formData.get("amountUsd") || 0);
  const cents = presetCents > 0 ? Math.round(presetCents) : Math.round(customUsd * 100);
  if (!Number.isInteger(cents) || cents < 5_000 || cents > 100_000_00) {
    redirect("/wallet?error=amount");
  }
  if (stripeEnabled()) {
    const url = await createStripeTopup({
      userId: user.id,
      email: user.email || "",
      cents,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    });
    redirect(url);
  }
  if (process.env.ALLOW_DEV_PAYMENTS !== "1") {
    redirect("/wallet?error=payments");
  }
  await topUpDev(user.id, cents);
  await notify({
    userId: user.id,
    kind: "topup",
    title: "Balance added",
    body: `${formatUsd(cents)} was added to your balance. Unused budget stays available for 42 days.`,
    href: "/wallet",
  });
  revalidatePath("/wallet");
  revalidatePath("/dashboard");
  redirect("/wallet?topup=success");
}
