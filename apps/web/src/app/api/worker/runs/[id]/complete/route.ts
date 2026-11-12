import { authenticateWorker, workerError } from "@/lib/worker-auth";
import { completeRun } from "@/lib/worker-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const worker = await authenticateWorker(request);
  if (!worker) return workerError("Invalid worker token");
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return workerError("Invalid completion body", 400);
  }
  const { id } = await params;
  try {
    const result = await completeRun(worker.id, id, body);
    if (!result) return workerError("Run not found for this worker", 404);
    return Response.json(result);
  } catch (error) {
    return workerError(error instanceof Error ? error.message : "Completion failed", 400);
  }
}
