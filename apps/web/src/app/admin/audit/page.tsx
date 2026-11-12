import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const entries = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Audit</h1>
      <p className="mt-2 text-sm text-slate-500">Admin and system actions.</p>
      <div className="mt-6 rounded-[2px] border border-slate-200 bg-white">
        {entries.length === 0 ? <p className="px-5 py-10 text-sm text-slate-500">No audit entries yet.</p> : (
          <div className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs">
                <span className="font-mono text-slate-700">{entry.action}</span>
                <span className="text-slate-500">{entry.actor} · {entry.createdAt.toLocaleString("en-GB")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
