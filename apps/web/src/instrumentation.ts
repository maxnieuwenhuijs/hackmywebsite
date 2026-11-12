export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DEMO_MODE !== "1") return;
  const { startMockWorker } = await import("@/lib/mock-worker");
  startMockWorker();
}
