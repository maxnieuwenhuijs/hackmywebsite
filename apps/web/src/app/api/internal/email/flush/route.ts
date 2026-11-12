import { processEmailOutbox } from "@/lib/email-sender";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("x-cron-secret") || "";
  if (!expected || supplied !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await processEmailOutbox(50);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Flush failed" }, { status: 500 });
  }
}
