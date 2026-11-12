import Link from "next/link";
import { prisma } from "@/lib/db";
import { Icon } from "@/components/icon";

export const dynamic = "force-dynamic";

function statusTone(status: string) {
  if (status === "ONLINE") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "OFFLINE") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-red-200 bg-red-50 text-red-700";
}

export default async function AdminWorkersPage() {
  const workers = await prisma.worker.findMany({
    orderBy: { name: "asc" },
    include: {
      runs: {
        where: { status: { in: ["RUNNING", "REPORTING"] } },
        orderBy: { startedAt: "desc" },
        take: 5,
        select: { id: true, host: true, status: true, startedAt: true, leaseExpiresAt: true },
      },
    },
  });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-700">Workers</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Scanner fleet.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Workers claim runs over the worker API. They get metadata only, upload ciphertext and never receive customer sessions or payment data.
          </p>
        </div>
        <span className="rounded-[2px] border border-slate-200 bg-white px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500">
          {workers.filter((worker) => worker.status === "ONLINE").length} online / {workers.length} total
        </span>
      </div>

      <div className="mt-8 space-y-4">
        {workers.length === 0 ? (
          <div className="rounded-[2px] border border-slate-200 bg-white px-6 py-14 text-center">
            <Icon name="precision_manufacturing" size={28} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-900">No worker registered</p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">Run the seed to create the local worker, or register a production worker with a hashed token.</p>
          </div>
        ) : (
          workers.map((worker) => (
            <section key={worker.id} className="rounded-[2px] border border-slate-200 bg-white">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-slate-900">{worker.name}</h2>
                    <span className={`rounded-[2px] border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${statusTone(worker.status)}`}>{worker.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {worker.version || "version not reported"} · last seen {worker.lastSeenAt ? worker.lastSeenAt.toLocaleString("en-GB") : "never"}
                  </p>
                </div>
                <Link className="text-sm text-blue-700 hover:underline" href="/admin/runs">All runs</Link>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-3">
                <div className="rounded-[2px] border border-slate-200 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500">Egress</p>
                  <p className="mt-2 font-mono text-xs text-slate-700">{worker.egressPeer || "peer not set"}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">{worker.egressIp || "IP not reported"}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">{worker.egressRange || "range not reported"}</p>
                </div>
                <div className="rounded-[2px] border border-slate-200 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500">Active leases</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{worker.runs.length}</p>
                  <p className="mt-1 text-xs text-slate-500">running or reporting</p>
                </div>
                <div className="rounded-[2px] border border-slate-200 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500">Worker API</p>
                  <p className="mt-2 text-sm text-slate-700">claim, heartbeat, events, upload, complete</p>
                  <p className="mt-1 text-xs text-slate-500">Token auth active</p>
                </div>
              </div>
              {worker.runs.length > 0 ? (
                <div className="border-t border-slate-200 px-5 py-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500">Current runs</p>
                  <div className="mt-2 space-y-1">
                    {worker.runs.map((run) => (
                      <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-slate-700">{run.host} <span className="font-mono text-slate-400">{run.id}</span></span>
                        <span className="text-slate-500">{run.status} · lease {run.leaseExpiresAt ? run.leaseExpiresAt.toLocaleTimeString("en-GB") : "not set"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
