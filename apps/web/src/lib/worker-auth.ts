import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

export function hashWorkerToken(token: string) {
  const pepper = process.env.WORKER_TOKEN_PEPPER || "local-worker-pepper";
  return createHash("sha256").update(`${token}:${pepper}`).digest("hex");
}

export async function authenticateWorker(request: Request) {
  const header = request.headers.get("authorization") || request.headers.get("x-worker-token") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : header.trim();
  if (!token) return null;
  const worker = await prisma.worker.findFirst({ where: { tokenHash: hashWorkerToken(token) } });
  if (!worker || worker.status === "DISABLED") return null;
  await prisma.worker.update({
    where: { id: worker.id },
    data: { status: "ONLINE", lastSeenAt: new Date() },
  });
  return worker;
}

export function workerError(message: string, status = 401) {
  return Response.json({ error: message }, { status });
}
