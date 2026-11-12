import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatUsd } from "@/lib/pricing";
import { Icon } from "@/components/icon";

export const dynamic = "force-dynamic";

function statusTone(status: string) {
  if (status === "RUNNING") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "QUEUED") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "COMPLETE") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "FAILED" || status === "CANCELLED") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default async function AdminOverviewPage() {
  const [users, runs, queued, running, payments, domains, egressPools, recent] = await Promise.all([
    prisma.user.count(),
    prisma.run.count(),
    prisma.run.count({ where: { status: "QUEUED" } }),
    prisma.run.count({ where: { status: "RUNNING" } }),
    prisma.payment.findMany({ where: { status: "PAID" }, select: { amountCents: true } }),
    prisma.domain.count({ where: { status: "VERIFIED" } }),
    prisma.egressPool.findMany({ select: { status: true, cidr: true, assignments: { where: { releasedAt: null }, select: { id: true } } } }),
    prisma.run.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { email: true } } } }),
  ]);
  const revenue = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const activeEgress = egressPools.filter((pool) => pool.status === "ACTIVE").length;

  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-700">Admin</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">The whole machine.</h1>
      <p className="mt-2 text-sm text-slate-500">Customers, money, queue and the egress pool in one view.</p>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Customers", String(users), "accounts", "group"],
          ["Revenue", formatUsd(revenue), "paid top-ups", "payments"],
          ["Runs", `${running} / ${queued}`, "running / queued", "radar"],
          ["Verified domains", String(domains), "ownership proof", "verified_user"],
        ].map(([label, value, note, icon]) => (
          <div key={label} className="rounded-[2px] border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</p><Icon name={icon} size={17} className="text-slate-400" /></div>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{note}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="rounded-[2px] border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div><h2 className="text-sm font-semibold text-slate-900">Recent runs</h2><p className="mt-1 text-xs text-slate-500">Every customer run, newest first.</p></div>
            <Link className="text-sm text-blue-700 hover:underline" href="/admin/runs">All runs</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Target</th><th className="px-5 py-3">Tier</th><th className="px-5 py-3">Budget</th><th className="px-5 py-3">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {recent.map((run) => (
                  <tr key={run.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-xs text-slate-600">{run.user.email}</td>
                    <td className="px-5 py-3"><Link className="font-medium text-slate-900 hover:text-blue-700" href={`/assessments/${run.id}`}>{run.host}</Link></td>
                    <td className="px-5 py-3 text-xs text-slate-500">{run.tier}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-700">{formatUsd(run.customerBudgetCents)}</td>
                    <td className="px-5 py-3"><span className={`rounded-[2px] border px-2 py-1 font-mono text-[10px] uppercase ${statusTone(run.status)}`}>{run.status.replaceAll("_", " ")}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[2px] border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-900">Egress pool</h2><Link className="text-sm text-blue-700 hover:underline" href="/admin/egress">Manage</Link></div>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{activeEgress} active</p>
            <p className="mt-1 text-xs text-slate-500">{egressPools.reduce((sum, pool) => sum + pool.assignments.length, 0)} assigned runs · {egressPools.length} pools</p>
            {egressPools.length === 0 ? <p className="mt-3 text-xs text-amber-700">Egress not provisioned yet. Demo pool data can be seeded locally.</p> : null}
          </div>
          <div className="rounded-[2px] border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Operational shortcuts</h2>
            <div className="mt-3 grid gap-2">
              <Link className="flex items-center justify-between rounded-[2px] border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:border-slate-400" href="/admin/verifications">Verifications <Icon name="chevron_right" size={15} /></Link>
              <Link className="flex items-center justify-between rounded-[2px] border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:border-slate-400" href="/admin/payments">Payments <Icon name="chevron_right" size={15} /></Link>
              <Link className="flex items-center justify-between rounded-[2px] border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:border-slate-400" href="/admin/audit">Audit log <Icon name="chevron_right" size={15} /></Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
