import { prisma } from "@/lib/db";
import { approveDomainAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminVerificationsPage() {
  const domains = await prisma.domain.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { email: true } }, verifications: { orderBy: { createdAt: "desc" }, take: 1 } } });
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Verifications</h1>
      <p className="mt-2 text-sm text-slate-500">Ownership evidence and expiry.</p>
      <div className="mt-6 overflow-x-auto rounded-[2px] border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-4 py-3">Domain</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Expires</th><th className="px-4 py-3">Review</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {domains.map((domain) => (
              <tr key={domain.id}>
                <td className="px-4 py-3 font-mono text-xs text-slate-700">{domain.hostname}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{domain.user.email}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{domain.verifiedMethod || domain.verifications[0]?.method || "pending"}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{domain.status}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{domain.expiresAt?.toLocaleDateString("en-GB") || "not verified"}</td>
                <td className="px-4 py-3">
                  {domain.status !== "VERIFIED" ? (
                    <form action={approveDomainAction}>
                      <input type="hidden" name="id" value={domain.id} />
                      <button className="rounded-[2px] border border-slate-300 px-2 py-1 text-[11px] text-slate-700 hover:border-slate-500" type="submit">Approve manually</button>
                    </form>
                  ) : (
                    <span className="text-[11px] text-slate-400">reviewed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
