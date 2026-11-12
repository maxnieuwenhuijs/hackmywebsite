import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatUsd } from "@/lib/pricing";
import { cancelRunAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminRunsPage() {
  const runs = await prisma.run.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { email: true } } } });
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Runs</h1>
      <p className="mt-2 text-sm text-slate-500">Queue, worker and budget state.</p>
      <div className="mt-6 overflow-x-auto rounded-[2px] border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Tier</th><th className="px-4 py-3">Budget</th><th className="px-4 py-3">Spent</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Control</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {runs.map((run) => (
              <tr key={run.id}>
                <td className="px-4 py-3 text-xs text-slate-600">{run.user.email}</td>
                <td className="px-4 py-3"><Link className="text-slate-900 hover:text-blue-700" href={`/assessments/${run.id}`}>{run.host}</Link></td>
                <td className="px-4 py-3 text-xs text-slate-500">{run.tier}</td>
                <td className="px-4 py-3 font-mono text-xs">{formatUsd(run.customerBudgetCents)}</td>
                <td className="px-4 py-3 font-mono text-xs">{formatUsd(run.chargedCents)}</td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {run.status}
                  {run.cancelRequested && !["CANCELLED", "COMPLETE", "FAILED"].includes(run.status) ? <p className="mt-1 text-[10px] text-amber-700">cancellation requested</p> : null}
                </td>
                <td className="px-4 py-3">
                  {["QUEUED", "RUNNING", "REPORTING"].includes(run.status) && !run.cancelRequested ? (
                    <form action={cancelRunAction}>
                      <input type="hidden" name="runId" value={run.id} />
                      <button className="rounded-[2px] border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 hover:border-amber-400" type="submit">Cancel</button>
                    </form>
                  ) : <span className="text-[11px] text-slate-400">none</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
