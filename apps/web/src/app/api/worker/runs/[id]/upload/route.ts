import { authenticateWorker, workerError } from "@/lib/worker-auth";
import { uploadReportBundle } from "@/lib/worker-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const worker = await authenticateWorker(request);
  if (!worker) return workerError("Invalid worker token");
  let body: {
    keyId?: unknown;
    envelope?: unknown;
    ciphertext?: unknown;
    sha256?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return workerError("Invalid upload body", 400);
  }
  const { id } = await params;
  try {
    const result = await uploadReportBundle(worker.id, id, body);
    if (!result) return workerError("Run not found for this worker", 404);
    return Response.json(result);
  } catch (error) {
    return workerError(error instanceof Error ? error.message : "Upload failed", 400);
  }
}
