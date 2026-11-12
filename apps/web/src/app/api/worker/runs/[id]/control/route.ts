import { authenticateWorker, workerError } from "@/lib/worker-auth";
import { getRunControl } from "@/lib/worker-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const worker = await authenticateWorker(request);
  if (!worker) return workerError("Invalid worker token");
  const { id } = await params;
  const result = await getRunControl(worker.id, id);
  if (!result) return workerError("Run not found for this worker", 404);
  return Response.json(result);
}
