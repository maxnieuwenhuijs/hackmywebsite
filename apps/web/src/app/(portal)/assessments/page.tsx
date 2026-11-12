import Link from "next/link";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatUsd } from "@/lib/pricing";
import { briefingCount } from "@/lib/assessments";
import { Icon } from "@/components/icon";

export const dynamic = "force-dynamic";

function statusTone(status: string) {
  if (status === "RUNNING") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "QUEUED" || status === "PENDING_VERIFICATION") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "COMPLETE") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "FAILED" || status === "CANCELLED") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default async function AssessmentsPage() {
  const user = await requireUser();
  const runs = await prisma.run.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-700">Assessments</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Every run, one place.</h1>
          <p className="mt-2 text-sm text-slate-500">Queue position, live findings and sealed reports.</p>
        </div>
        <Link className="inline-flex items-center gap-2 rounded-[2px] bg-blue-700 px-4 py-2.5 text-sm text-white hover:bg-blue-800" href="/assessments/new">
          New assessment <Icon name="add" size={16} />
        </Link>
      </div>

      <div className="mt-8 overflow-hidden rounded-[2px] border border-slate-200 bg-white">
        {runs.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-[2px] border border-slate-200 text-slate-400"><Icon name="radar" size={22} /></span>
            <p className="mt-4 text-sm font-medium text-slate-900">No assessments yet</p>
            <p className="mt-1 text-sm text-slate-500">Add balance and verify a domain to start.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500">
                <tr><th className="px-5 py-3">Target</th><th className="px-5 py-3">Depth</th><th className="px-5 py-3">Budget</th><th className="px-5 py-3">Briefings</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Started</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4"><Link className="font-medium text-slate-900 hover:text-blue-700" href={`/assessments/${run.id}`}>{run.host}</Link><p className="mt-1 font-mono text-[10px] text-slate-400">{run.id}</p></td>
                    <td className="px-5 py-4 text-slate-600">{run.tier}</td>
                    <td className="px-5 py-4 font-mono text-slate-700">{formatUsd(run.customerBudgetCents)}</td>
                    <td className="px-5 py-4 text-slate-600">{run.briefingsSent} / {briefingCount(run.customerBudgetCents)}</td>
                    <td className="px-5 py-4"><span className={`rounded-[2px] border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${statusTone(run.status)}`}>{run.status.replaceAll("_", " ")}</span></td>
                    <td className="px-5 py-4 text-xs text-slate-500">{run.startedAt ? run.startedAt.toLocaleString("en-GB") : "not started"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
