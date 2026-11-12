import { prisma } from "@/lib/db";
import { briefingThresholds } from "@/lib/assessments";
import { notify } from "@/lib/notifications";
import { createReportBundleForRun } from "@/lib/report-bundle";
import { finalizeCancelledRun } from "@/lib/run-cancel";

const globalForMock = globalThis as unknown as { __hmwMockStarted?: boolean };
let busy = false;

const FINDINGS = [
  { title: "Missing access-control check on a customer object", severity: "critical", status: "confirmed", endpoint: "/api/records/1005" },
  { title: "Session token signature is not verified", severity: "critical", status: "confirmed", endpoint: "/api/session" },
  { title: "Internal fetch through the avatar URL parameter", severity: "high", status: "confirmed", endpoint: "/api/avatar?url=" },
  { title: "Private file readable by another account", severity: "high", status: "confirmed", endpoint: "/api/files/1001" },
  { title: "Restricted download path is bypassable", severity: "medium", status: "confirmed", endpoint: "/download?file=" },
  { title: "Missing security headers and cookie flags", severity: "low", status: "confirmed", endpoint: "/" },
];

const THOUGHTS = [
  { at: 0, step: "mapper-1", agent: "mapper", tag: "surface", important: false, text: "I mapped the public surface first: login, password reset, upload and the invoice routes. The reset flow returned a different response for a known email, so I am keeping that thread." },
  { at: 0, step: "authz-1", agent: "authz", tag: "access", important: false, text: "The login form behaves differently when the email exists. That is a useful oracle, but not enough on its own. I am checking what the session token actually validates." },
  { at: 0, step: "injector-1", agent: "injector", tag: "input", important: false, text: "The avatar endpoint accepts a full URL. I am testing whether it will fetch an internal address instead of an image." },
  { at: 0.12, step: "chain-1", agent: "chain", tag: "chain", important: true, text: "There is a pattern here: anonymous read, predictable object ids, and a role claim the client can choose. I am going to test whether those three compose into a real chain." },
  { at: 0.25, step: "authz-2", agent: "authz", tag: "warning", important: true, text: "The admin route checks the role claim in the request body, not the role on the server. A crafted session may be enough to open the console." },
  { at: 0.35, step: "injector-2", agent: "injector", tag: "warning", important: true, text: "The download filter can be bypassed with a doubled slash. I am reading one restricted test file to confirm the path traversal." },
  { at: 0.48, step: "exploiter-1", agent: "exploiter", tag: "warning", important: true, text: "I can read a private invoice from another account. I am stopping at read access, recording the exact response, and not touching any customer data." },
  { at: 0.58, step: "chain-2", agent: "chain", tag: "chain", important: true, text: "The file read exposes credentials. Those credentials open the admin console. This is the shortest route from anonymous visitor to administrator." },
  { at: 0.68, step: "mapper-2", agent: "mapper", tag: "surface", important: false, text: "The edge route is reachable without the internal header. There is no allowlist on this path from the public internet." },
  { at: 0.78, step: "authz-3", agent: "authz", tag: "warning", important: true, text: "The admin API trusts a forged role header and the session is not bound to step-up authentication. I am keeping this as the primary access-control finding." },
  { at: 0.87, step: "reporter-1", agent: "reporter", tag: "evidence", important: false, text: "I captured the request and response for every step. The chain replays from an anonymous session, so the final report can show the exact path." },
  { at: 0.95, step: "exploiter-2", agent: "exploiter", tag: "safety", important: false, text: "Proof was captured on my own test object. No customer data was changed and no state was left behind." },
  { at: 1, step: "reporter-2", agent: "reporter", tag: "report", important: false, text: "Sealing the evidence and handing the chain to the final report. The live briefings only carry the current snapshot." },
];

function findingsFor(progress: number) {
  const count = progress >= 1 ? FINDINGS.length : Math.max(1, Math.ceil(progress * FINDINGS.length));
  return FINDINGS.slice(0, count);
}

export function startMockWorker() {
  if (process.env.DEMO_MODE !== "1") return;
  if (globalForMock.__hmwMockStarted) return;
  globalForMock.__hmwMockStarted = true;
  setInterval(() => { void tick(); }, 3_000);
  void tick();
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const queued = await prisma.run.findFirst({ where: { status: "QUEUED" }, orderBy: { queuedAt: "asc" } });
    if (queued) {
      const pool = await prisma.egressPool.findFirst({ where: { status: "ACTIVE" } });
      await prisma.run.update({
        where: { id: queued.id },
        data: { status: "RUNNING", startedAt: new Date(), heartbeatAt: new Date(), egressIp: "203.0.113.10", egressRange: pool?.cidr || "203.0.113.0/28", egressAssignedAt: new Date() },
      });
      if (pool) {
        const existing = await prisma.egressAssignment.findFirst({ where: { runId: queued.id, releasedAt: null } });
        if (!existing) {
          await prisma.egressAssignment.create({
            data: { poolId: pool.id, runId: queued.id, ip: "203.0.113.10", status: "ACTIVE" },
          });
          await prisma.egressPool.update({ where: { id: pool.id }, data: { lastAssignedAt: new Date() } });
        }
      }
      await notify({
        userId: queued.userId,
        kind: "started",
        title: "Your assessment started",
        body: `The swarm is now working on ${queued.host}. You will get live briefings at the budget thresholds.`,
        href: `/assessments/${queued.id}`,
      });
    }

    const running = await prisma.run.findMany({
      where: { status: "RUNNING" },
      include: { briefings: true, events: { orderBy: { seq: "asc" } } },
    });
    for (const run of running) {
      if (run.cancelRequested) {
        await finalizeCancelledRun(run.id);
        continue;
      }
      const started = run.startedAt?.getTime() || Date.now();
      const elapsed = Date.now() - started;
      const duration = Math.max(5_000, Number(process.env.MOCK_RUN_DURATION_MS || 15_000));
      const progress = Math.min(1, elapsed / duration);
      const findings = findingsFor(progress);
      const chargedCents = Math.min(run.customerBudgetCents, Math.round(run.customerBudgetCents * progress));
      const internalCostCents = Math.min(run.internalCapCents, Math.round(chargedCents / 12.5));
      const thresholds = Array.isArray((run.briefingPlan as { thresholds?: number[] } | null)?.thresholds)
        ? (run.briefingPlan as { thresholds: number[] }).thresholds
        : briefingThresholds(run.customerBudgetCents);
      const existingSteps = new Set(
        run.events
          .map((event) => {
            const payload = event.payload as { step?: unknown } | null;
            return typeof payload?.step === "string" ? payload.step : null;
          })
          .filter(Boolean),
      );
      let nextSeq = run.events.reduce((max, event) => Math.max(max, event.seq), 0) + 1;
      for (const thought of THOUGHTS) {
        if (progress < thought.at || existingSteps.has(thought.step)) continue;
        await prisma.runEvent.create({
          data: {
            runId: run.id,
            seq: nextSeq++,
            type: "thought",
            payload: {
              step: thought.step,
              agent: thought.agent,
              tag: thought.tag,
              important: thought.important,
              text: thought.text,
            },
          },
        });
      }
      let sent = run.briefings.length;
      for (const threshold of thresholds) {
        if (progress * 100 < threshold || run.briefings.some((briefing) => briefing.thresholdPct === threshold)) continue;
        const seq = sent + 1;
        await prisma.runBriefing.create({
          data: {
            runId: run.id,
            seq,
            thresholdPct: threshold,
            status: "SENT",
            title: `Live briefing ${seq} of ${thresholds.length}`,
            summary: `${findings.length} finding${findings.length === 1 ? "" : "s"} so far. ${progress >= 1 ? "The final report is being sealed." : "The swarm is still working; this snapshot is preliminary."}`,
            findings: findings.slice(0, 4),
            coverage: { routesProbed: Math.round(progress * 42), agents: ["mapper", "authz", "injector", "chain"] },
            agentStats: { active: progress < 1 ? 3 : 0, completed: Math.round(progress * 4), failed: 0 },
            deliveredAt: new Date(),
          },
        });
        sent = seq;
        await prisma.run.update({ where: { id: run.id }, data: { briefingsSent: sent } });
        await notify({
          userId: run.userId,
          kind: "briefing",
          title: `Briefing ${seq} ready for ${run.host}`,
          body: `${findings.length} findings so far. Open the assessment for the current snapshot.`,
          href: `/assessments/${run.id}`,
        });
      }

      if (progress >= 1) {
        await prisma.$transaction(async (tx) => {
          const current = await tx.run.findUniqueOrThrow({ where: { id: run.id } });
          const wallet = await tx.wallet.findUnique({ where: { userId: run.userId } });
          if (wallet) {
            const held = Math.max(0, wallet.heldCents - current.customerBudgetCents);
            const balance = Math.max(0, wallet.balanceCents - chargedCents);
            await tx.wallet.update({ where: { userId: run.userId }, data: { heldCents: held, balanceCents: balance } });
            await tx.ledgerEntry.create({
              data: {
                userId: run.userId,
                runId: run.id,
                kind: "CHARGE",
                amountCents: -chargedCents,
                balanceAfterCents: balance - held,
                meta: { mock: true, internalCostCents },
              },
            });
          }
          await tx.run.update({
            where: { id: run.id },
            data: { status: "COMPLETE", chargedCents, internalCostCents, findings, finishedAt: new Date() },
          });
          await tx.egressAssignment.updateMany({
            where: { runId: run.id, releasedAt: null },
            data: { status: "OFFLINE", releasedAt: new Date() },
          });
        });
        await notify({
          userId: run.userId,
          kind: "complete",
          title: `Final report ready for ${run.host}`,
          body: "The assessment is complete. The sealed report will be delivered by email with a 48-hour code.",
          href: `/assessments/${run.id}`,
        });
        try {
          await createReportBundleForRun(run.id);
        } catch (error) {
          console.error("[mock-worker] report bundle", error);
        }
      } else {
        await prisma.run.update({ where: { id: run.id }, data: { chargedCents, internalCostCents, findings, heartbeatAt: new Date() } });
      }
    }
  } catch (error) {
    console.error("[mock-worker]", error);
  } finally {
    busy = false;
  }
}
