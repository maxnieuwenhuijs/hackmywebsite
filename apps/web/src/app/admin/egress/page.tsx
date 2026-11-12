import { prisma } from "@/lib/db";
import { Icon } from "@/components/icon";
import { setEgressStatusAction } from "./actions";

export const dynamic = "force-dynamic";

function bytes(value: bigint | number) {
  const n = Number(value);
  if (n > 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} GB`;
  if (n > 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n > 1_000) return `${(n / 1_000).toFixed(1)} KB`;
  return `${n} B`;
}

export default async function EgressAdminPage() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pools = await prisma.egressPool.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      assignments: { where: { releasedAt: null }, include: { run: true, worker: true }, take: 5 },
      metrics: { where: { bucketStart: { gte: since } }, orderBy: { bucketStart: "asc" } },
    },
  });
  const totals = pools.reduce(
    (acc, pool) => {
      acc.requests += pool.metrics.reduce((sum, metric) => sum + metric.requests, 0);
      acc.errors += pool.metrics.reduce((sum, metric) => sum + metric.errors, 0);
      acc.bytes += pool.metrics.reduce((sum, metric) => sum + Number(metric.bytesIn) + Number(metric.bytesOut), 0);
      acc.assigned += pool.assignments.length;
      return acc;
    },
    { requests: 0, errors: 0, bytes: 0, assigned: 0 },
  );
  const buckets = new Map<string, number>();
  for (const pool of pools) for (const metric of pool.metrics) {
    const key = metric.bucketStart.toISOString().slice(11, 16);
    buckets.set(key, (buckets.get(key) || 0) + metric.requests);
  }
  const chart = [...buckets.entries()].slice(-24);
  const max = Math.max(1, ...chart.map(([, value]) => value));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-700">Egress</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Proxy pool and traffic.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">The static range every scan exits from. Assignments, traffic and quarantine controls. No request bodies are stored here.</p>
        </div>
        <span className="rounded-[2px] border border-slate-200 bg-white px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500">{pools.length ? `${pools.length} pool${pools.length === 1 ? "" : "s"}` : "not provisioned"}</span>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Assigned runs", String(totals.assigned), "active assignments", "link"],
          ["Requests 24h", totals.requests.toLocaleString("en-GB"), "all pool IPs", "swap_horiz"],
          ["Errors 24h", totals.errors.toLocaleString("en-GB"), "upstream failures", "error"],
          ["Traffic 24h", bytes(totals.bytes), "in + out", "data_usage"],
        ].map(([label, value, note, icon]) => (
          <div key={label} className="rounded-[2px] border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</p><Icon name={icon} size={17} className="text-slate-400" /></div>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{note}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-[2px] border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-900">Request rate, 24h</h2><span className="font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500">5 min buckets</span></div>
        <div className="mt-4 flex h-32 items-end gap-1">
          {chart.length === 0 ? <p className="self-center text-sm text-slate-500">No traffic samples yet.</p> : chart.map(([label, value]) => (
            <div key={label} className="group relative flex-1" title={`${label}: ${value}`}>
              <div className="w-full rounded-t-[1px] bg-blue-600/80" style={{ height: `${Math.max(4, (value / max) * 112)}px` }} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-slate-400"><span>{chart[0]?.[0] || ""}</span><span>{chart.at(-1)?.[0] || ""}</span></div>
      </section>

      <section className="mt-6 rounded-[2px] border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Pools</h2><p className="mt-1 text-xs text-slate-500">One row per leased range.</p></div>
        {pools.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Icon name="dns" size={28} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-900">Egress not provisioned</p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">Add an EgressPool row and point the gateway at the portal. This page will show live assignments and traffic only when the gateway exists; it will not invent numbers.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pools.map((pool) => {
              const requests = pool.metrics.reduce((sum, metric) => sum + metric.requests, 0);
              const errors = pool.metrics.reduce((sum, metric) => sum + metric.errors, 0);
              return (
                <div key={pool.id} className="px-5 py-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-sm font-medium text-slate-900">{pool.cidr}</code>
                        <span className={`rounded-[2px] border px-2 py-1 font-mono text-[10px] uppercase ${pool.status === "ACTIVE" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : pool.status === "QUARANTINED" ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{pool.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{pool.provider} · {pool.region} · {pool.ptr || "no PTR"} · {pool.assignments.length} active</p>
                    </div>
                    <form action={setEgressStatusAction} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={pool.id} />
                      <input type="hidden" name="status" value={pool.status === "QUARANTINED" ? "ACTIVE" : "QUARANTINED"} />
                      <button className={`rounded-[2px] border px-3 py-2 text-xs ${pool.status === "QUARANTINED" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`} type="submit">{pool.status === "QUARANTINED" ? "Release" : "Quarantine"}</button>
                    </form>
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
                    <div className="rounded-[2px] border border-slate-200 p-4">
                      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500">24h traffic</p>
                      <p className="mt-2 text-sm text-slate-700">{requests.toLocaleString("en-GB")} requests · {errors} errors</p>
                      <p className="mt-1 text-xs text-slate-500">{bytes(pool.metrics.reduce((sum, metric) => sum + Number(metric.bytesIn) + Number(metric.bytesOut), 0))} transferred</p>
                    </div>
                    <div className="rounded-[2px] border border-slate-200 p-4">
                      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500">Assignments</p>
                      {pool.assignments.length === 0 ? <p className="mt-2 text-xs text-slate-500">No active assignment.</p> : (
                        <div className="mt-2 space-y-1">
                          {pool.assignments.map((assignment) => (
                            <p key={assignment.id} className="text-xs text-slate-600"><code className="font-mono">{assignment.ip}</code> · {assignment.run.host} · {assignment.worker?.name || "unassigned worker"}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
