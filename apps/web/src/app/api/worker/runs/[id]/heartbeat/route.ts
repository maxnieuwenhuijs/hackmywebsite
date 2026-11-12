import { authenticateWorker, workerError } from "@/lib/worker-auth";
import { heartbeatRun } from "@/lib/worker-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const worker = await authenticateWorker(request);
  if (!worker) return workerError("Invalid worker token");
  let body: { version?: unknown; egressIp?: unknown; egressRange?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const { id } = await params;
  try {
    const result = await heartbeatRun(worker.id, id, {
      version: typeof body.version === "string" ? body.version.slice(0, 100) : undefined,
      egressIp: typeof body.egressIp === "string" ? body.egressIp.slice(0, 100) : undefined,
      egressRange: typeof body.egressRange === "string" ? body.egressRange.slice(0, 100) : undefined,
    });
    if (!result) return workerError("Run not found for this worker", 404);
    return Response.json(result);
  } catch (error) {
    return workerError(error instanceof Error ? error.message : "Heartbeat failed", 400);
  }
}
