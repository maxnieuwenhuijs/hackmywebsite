import Link from "next/link";
import { getSessionUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatUsd } from "@/lib/pricing";
import { availableWalletCents, briefingCount } from "@/lib/assessments";
import { Icon } from "@/components/icon";

export const dynamic = "force-dynamic";

function statusTone(status: string) {
  if (status === "RUNNING") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "QUEUED" || status === "PENDING_VERIFICATION") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "COMPLETE") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "FAILED" || status === "CANCELLED") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) return null;
  const [runs, domains, notifications, totalFindings] = await Promise.all([
    prisma.run.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.domain.count({ where: { userId: user.id, status: "VERIFIED" } }),
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 4 }),
    prisma.run.count({ where: { userId: user.id, status: { in: ["COMPLETE", "PARTIAL"] } } }),
  ]);
  const wallet = user.wallet;
  const available = availableWalletCents(wallet);
  const firstName = (user.name || user.email || "there").split(" ")[0].split("@")[0];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-700">Overview</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Welcome back, {firstName}.</h1>
          <p className="mt-2 text-sm text-slate-500">Your balance, verified domains and assessments in one place.</p>
        </div>
        <Link className="inline-flex items-center gap-2 rounded-[2px] bg-slate-900 px-4 py-2.5 text-sm text-white hover:bg-slate-800" href="/assessments/new">
          Start an assessment
          <Icon name="arrow_forward" size={16} />
        </Link>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Available balance", formatUsd(available), wallet?.heldCents ? `${formatUsd(wallet.heldCents)} held` : "No active hold", "account_balance_wallet"],
          ["Verified domains", String(domains), "ownership proof on file", "verified_user"],
          ["Completed runs", String(totalFindings), "final reports available", "task_alt"],
          ["Active assessments", String(runs.filter((run) => ["QUEUED", "RUNNING", "REPORTING"].includes(run.status)).length), "queued or running", "radar"],
        ].map(([label, value, note, icon]) => (
          <div key={label} className="rounded-[2px] border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
              <Icon name={icon} size={17} className="text-slate-400" />
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{note}</p>
          </div>
        ))}
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_340px]">
        <section className="rounded-[2px] border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Recent assessments</h2>
              <p className="mt-1 text-xs text-slate-500">Live briefings and sealed reports.</p>
            </div>
            <Link className="text-sm text-blue-700 hover:underline" href="/assessments">View all</Link>
          </div>
          {runs.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-[2px] border border-slate-200 text-slate-400">
                <Icon name="radar" size={22} />
              </span>
              <p className="mt-4 text-sm font-medium text-slate-900">No assessments yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">
                Top up your balance, verify a domain, then choose Recon, Pentest or Deep.
              </p>
              <Link className="mt-5 inline-flex items-center gap-2 rounded-[2px] bg-blue-700 px-4 py-2.5 text-sm text-white hover:bg-blue-800" href="/wallet">
                Add balance
                <Icon name="arrow_forward" size={16} />
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {runs.map((run) => (
                <Link key={run.id} href={`/assessments/${run.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{run.host}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {run.tier} · {formatUsd(run.customerBudgetCents)} cap · {briefingCount(run.customerBudgetCents)} briefing{briefingCount(run.customerBudgetCents) === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className={`rounded-[2px] border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${statusTone(run.status)}`}>
                    {run.status.replaceAll("_", " ")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[2px] border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
            <Link className="text-sm text-blue-700 hover:underline" href="/notifications">All</Link>
          </div>
          {notifications.length === 0 ? (
            <p className="px-5 py-10 text-sm text-slate-500">Nothing yet. We notify you when a run starts and when a briefing is ready.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((notification) => (
                <Link key={notification.id} href={notification.href || "/notifications"} className="block px-5 py-4 hover:bg-slate-50">
                  <div className="flex items-start gap-3">
                    <Icon name={notification.readAt ? "notifications_none" : "notifications_active"} size={17} className={notification.readAt ? "mt-0.5 text-slate-400" : "mt-0.5 text-blue-700"} />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{notification.title}</p>
                      {notification.body ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{notification.body}</p> : null}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          ["/wallet", "Add balance", "Prepaid credit. Unused budget stays on your account for 42 days.", "add_card"],
          ["/domains", "Verify a domain", "DNS, a file or a work inbox. One proof is enough.", "verified_user"],
          ["/assessments/new", "Choose an assessment", "Recon, Pentest or Deep. Each with live briefings.", "tune"],
        ].map(([href, title, text, icon]) => (
          <Link key={href} href={href} className="rounded-[2px] border border-slate-200 bg-white p-5 transition hover:border-slate-400">
            <Icon name={icon} size={20} className="text-slate-500" />
            <p className="mt-3 text-sm font-semibold text-slate-900">{title}</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">{text}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
