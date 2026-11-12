import Stripe from "stripe";
import { prisma } from "@/lib/db";
import { creditTopup } from "@/lib/wallet";
import { notify } from "@/lib/notifications";
import { formatUsd } from "@/lib/pricing";

export function stripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export async function createStripeTopup(input: { userId: string; email: string; cents: number; appUrl: string }) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured");
  const stripe = new Stripe(key);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: input.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: input.cents,
          product_data: {
            name: "hackmywebsite.ai account balance",
            description: "Prepaid balance. Unused credit stays on the account until its expiry date.",
          },
        },
      },
    ],
    success_url: `${input.appUrl}/wallet?topup=success`,
    cancel_url: `${input.appUrl}/wallet?topup=cancelled`,
    metadata: { userId: input.userId, topupCents: String(input.cents) },
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  await prisma.payment.create({
    data: {
      userId: input.userId,
      provider: "stripe",
      providerId: session.id,
      amountCents: input.cents,
      status: "PENDING",
      raw: { checkoutUrl: session.url },
    },
  });
  return session.url;
}

export async function handleStripeWebhook(rawBody: string, signature: string | null) {
  const key = process.env.STRIPE_SECRET_KEY;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !secret || !signature) throw new Error("Stripe webhook is not configured");
  const stripe = new Stripe(key);
  const event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  if (event.type !== "checkout.session.completed") return { received: true, ignored: true };
  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.metadata?.userId;
  const cents = Number(session.metadata?.topupCents || 0);
  if (!userId || !Number.isInteger(cents) || cents < 5_000) throw new Error("Invalid Stripe metadata");
  const payment = await prisma.payment.findUnique({ where: { providerId: session.id } });
  if (payment?.status === "PAID") return { received: true, duplicate: true };
  await creditTopup({ userId, cents, provider: "stripe", providerId: session.id, meta: { eventId: event.id } });
  await notify({
    userId,
    kind: "topup",
    title: "Balance added",
    body: `${formatUsd(cents)} was added to your balance.`,
    href: "/wallet",
  });
  return { received: true };
}
