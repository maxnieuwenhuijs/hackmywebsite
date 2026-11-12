import { NextResponse } from "next/server";
import { handleStripeWebhook } from "@/lib/stripe-payments";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    const signature = request.headers.get("stripe-signature");
    const result = await handleStripeWebhook(raw, signature);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "webhook failed" }, { status: 400 });
  }
}
