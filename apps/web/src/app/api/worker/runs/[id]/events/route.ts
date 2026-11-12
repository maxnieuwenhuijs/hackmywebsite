import { authenticateWorker, workerError } from "@/lib/worker-auth";
import { appendRunEvents } from "@/lib/worker-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const worker = await authenticateWorker(request);
  if (!worker) return workerError("Invalid worker token");
  let body: { events?: unknown };
  try {
    body = await request.json();
  } catch {
    return workerError("Invalid event body", 400);
  }
  const { id } = await params;
  try {
    const result = await appendRunEvents(worker.id, id, body);
    if (!result) return workerError("Run not found for this worker", 404);
    return Response.json(result);
  } catch (error) {
    return workerError(error instanceof Error ? error.message : "Event batch failed", 400);
  }
}
