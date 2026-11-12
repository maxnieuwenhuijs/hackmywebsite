import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatUsd } from "@/lib/pricing";
import { briefingCount, briefingThresholds } from "@/lib/assessments";
import { thoughtFromEvent } from "@/lib/swarm-agents";
import { Icon } from "@/components/icon";
import { SwarmThinking } from "@/components/portal/swarm-thinking";
import { reissueDeliveryCodeAction } from "../actions";

export const dynamic = "force-dynamic";

function statusTone(status: string) {
  if (status === "RUNNING") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "QUEUED") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "COMPLETE") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "FAILED" || status === "CANCELLED") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default async function AssessmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reissued?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const run = await prisma.run.findFirst({
    where: { id, userId: user.id },
    include: {
      briefings: { orderBy: { seq: "asc" } },
      domain: true,
      events: { where: { type: "thought" }, orderBy: { seq: "asc" }, take: 100 },
      bundle: true,
    },
  });
  if (!run) notFound();
  const deliveryNotification = await prisma.notification.findFirst({
    where: { userId: user.id, kind: "report_ready", body: { contains: run.id } },
    orderBy: { createdAt: "desc" },
  });
  const deliveryHref = deliveryNotification?.href || null;
  const devDeliveryCode = process.env.ALLOW_DEV_EMAIL === "1" ? process.env.DEV_DELIVERY_CODE : undefined;
  const findings = Array.isArray(run.findings) ? run.findings as Array<{ title?: string; severity?: string; status?: string; endpoint?: string }> : [];
  const thoughts = run.events.map(thoughtFromEvent).filter((event): event is NonNullable<typeof event> => Boolean(event));
  const thresholds = briefingThresholds(run.customerBudgetCents);
  const expected = briefingCount(run.customerBudgetCents);
  const spentPct = Math.min(100, Math.round((run.chargedCents / Math.max(1, run.customerBudgetCents)) * 100));
  const isImportantFinding = (severity: string | undefined) => severity === "critical" || severity === "high";

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link className="inline-flex items-center gap-2 text-xs text-slate-500 hover:text-slate-900" href="/assessments"><Icon name="arrow_back" size={15} /> All assessments</Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{run.host}</h1>
          <p className="mt-1 font-mono text-[11px] text-slate-500">{run.id}</p>
        </div>
        <span className={`rounded-[2px] border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${statusTone(run.status)}`}>{run.status.replaceAll("_", " ")}</span>
      </div>

      {query.reissued ? (
        <div className="mt-6 flex gap-3 rounded-[2px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <Icon name="mark_email_read" size={18} />
          A new delivery code was created. The old code no longer works.
        </div>
      ) : null}
      {query.error === "report" ? (
        <div className="mt-6 flex gap-3 rounded-[2px] border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <Icon name="error" size={18} />
          This run has no sealed report yet.
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Depth", run.tier, "assessment mode"],
          ["Budget cap", formatUsd(run.customerBudgetCents), "held while active"],
          ["Charged", formatUsd(run.chargedCents), "customer view"],
          ["Briefings", `${run.briefingsSent} / ${expected}`, thresholds.map((pct) => `${pct}%`).join(" · ")],
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-[2px] border border-slate-200 bg-white p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{note}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-[2px] border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between text-xs text-slate-500"><span>Progress</span><span>{spentPct}% of cap</span></div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-blue-700 transition-all" style={{ width: `${spentPct}%` }} /></div>
        <p className="mt-3 text-xs text-slate-500">
          {run.status === "QUEUED" ? "Waiting for a worker. You will get a notification when it starts." : run.status === "RUNNING" ? "The swarm is running. Briefings appear below as the budget thresholds are reached." : run.status === "COMPLETE" ? "The final report is sealed and will be delivered by email." : "This run is not active."}
        </p>
      </div>

      <div className="mt-6">
        <SwarmThinking
          runId={run.id}
          initialThoughts={thoughts}
          initialStatus={run.status}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <section className="space-y-6">
          <div className="rounded-[2px] border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div><h2 className="text-sm font-semibold text-slate-900">Live findings</h2><p className="mt-1 text-xs text-slate-500">Current snapshot. The final report contains the evidence.</p></div>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500">{findings.length} found</span>
            </div>
            {findings.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500">No findings yet. The swarm will publish a briefing when the threshold is reached.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {findings.map((finding, index) => (
                  <div key={`${finding.title}-${index}`} className={`flex flex-wrap items-start justify-between gap-3 px-5 py-4 ${isImportantFinding(finding.severity) ? "border-l-2 border-red-400 bg-red-50/40" : ""}`}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`text-sm font-medium ${isImportantFinding(finding.severity) ? "text-red-800 underline decoration-red-300 underline-offset-4" : "text-slate-900"}`}>{finding.title || "Untitled finding"}</p>
                        {isImportantFinding(finding.severity) ? (
                          <span className="inline-flex items-center gap-1 rounded-[2px] border border-red-300 bg-red-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-red-700">
                            <Icon name="warning" size={11} />
                            warning
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-slate-500">{finding.endpoint || "endpoint not recorded"}</p>
                    </div>
                    <div className="flex gap-2">
                      <span className={`rounded-[2px] border px-2 py-1 font-mono text-[10px] uppercase ${isImportantFinding(finding.severity) ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{finding.severity || "info"}</span>
                      <span className="rounded-[2px] border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[10px] uppercase text-slate-600">{finding.status || "confirmed"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[2px] border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Briefings</h2><p className="mt-1 text-xs text-slate-500">Short updates while the run is active.</p></div>
            {run.briefings.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500">No briefing yet.</p>
            ) : (
              <div className="space-y-4 p-5">
                {run.briefings.map((briefing) => (
                  <article key={briefing.id} className="rounded-[2px] border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{briefing.title}</p>
                      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-blue-700">Briefing {briefing.seq} of {expected}</span>
                    </div>
                    {briefing.summary ? <p className="mt-2 text-sm leading-6 text-slate-600">{briefing.summary}</p> : null}
                    {Array.isArray(briefing.findings) && briefing.findings.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(briefing.findings as Array<{ title?: string; severity?: string }>).slice(0, 6).map((finding, index) => (
                          <span key={`${briefing.id}-${index}`} className="rounded-[2px] border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">{finding.title} · {finding.severity}</span>
                        ))}
                      </div>
                    ) : null}
                    <p className="mt-3 text-[11px] text-slate-400">Generated {briefing.createdAt.toLocaleString("en-GB")} · preliminary</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-[2px] border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Target</h2>
            <p className="mt-2 break-all text-sm text-slate-600">{run.url}</p>
            <p className="mt-2 text-xs text-slate-500">Verified domain: {run.domain.hostname}</p>
            <p className="mt-1 text-xs text-slate-500">Verification valid until {run.domain.expiresAt?.toLocaleDateString("en-GB") || "not recorded"}</p>
          </div>
          <div className="rounded-[2px] border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Final report</h2>
            {run.bundle ? (
              <>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  The sealed bundle is encrypted to your report key. The server stores ciphertext only.
                </p>
                {deliveryHref ? (
                  <Link href={deliveryHref} className="mt-4 inline-flex items-center gap-2 rounded-[2px] bg-blue-700 px-3 py-2 text-xs font-medium text-white hover:bg-blue-800">
                    <Icon name="lock_open" size={15} />
                    Open sealed report
                  </Link>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">Check your notifications and email for the delivery link.</p>
                )}
                {devDeliveryCode ? (
                  <p className="mt-3 rounded-[2px] border border-amber-200 bg-amber-50 p-2 font-mono text-[10px] text-amber-800">
                    Local delivery code: {devDeliveryCode}
                  </p>
                ) : null}
                <p className="mt-3 text-[11px] text-slate-400">The delivery code expires after 48 hours. Your passphrase is required to decrypt.</p>
                <form action={reissueDeliveryCodeAction} className="mt-3">
                  <input type="hidden" name="runId" value={run.id} />
                  <button className="inline-flex items-center gap-2 rounded-[2px] border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:border-slate-500" type="submit">
                    <Icon name="mail" size={15} />
                    Email me a new code
                  </button>
                </form>
              </>
            ) : run.status === "COMPLETE" ? (
              <>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  The run is complete. Set a report passphrase to seal the report if that was not done before the run finished.
                </p>
                <Link className="mt-4 inline-flex items-center gap-2 rounded-[2px] border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:border-slate-500" href="/report-key">
                  <Icon name="key" size={15} />
                  Set report passphrase
                </Link>
              </>
            ) : (
              <p className="mt-2 text-sm leading-6 text-slate-500">
                The report will be sealed and delivered after the run completes. We send a 48-hour code and you decrypt it in the browser.
              </p>
            )}
          </div>
          <div className="rounded-[2px] border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Need to stop?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Contact support with the run id. We can cancel between steps and release the remaining hold.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
