import { authenticateWorker, workerError } from "@/lib/worker-auth";
import { claimNextRun } from "@/lib/worker-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const worker = await authenticateWorker(request);
  if (!worker) return workerError("Invalid worker token");
  try {
    const claim = await claimNextRun(worker);
    return Response.json(claim || { run: null });
  } catch (error) {
    return workerError(error instanceof Error ? error.message : "Claim failed", 500);
  }
}
