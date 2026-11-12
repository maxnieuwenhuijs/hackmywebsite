import { prisma } from "@/lib/db";
import { formatUsd } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { wallet: true, _count: { select: { runs: true, domains: true } } },
  });
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Customers</h1>
      <p className="mt-2 text-sm text-slate-500">Accounts, balance and activity.</p>
      <div className="mt-6 overflow-x-auto rounded-[2px] border border-slate-200 bg-white">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Balance</th><th className="px-4 py-3">Held</th><th className="px-4 py-3">Runs</th><th className="px-4 py-3">Domains</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-3 text-slate-700">{user.email}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{user.role}</td>
                <td className="px-4 py-3 font-mono text-xs">{formatUsd(user.wallet?.balanceCents || 0)}</td>
                <td className="px-4 py-3 font-mono text-xs">{formatUsd(user.wallet?.heldCents || 0)}</td>
                <td className="px-4 py-3 text-xs">{user._count.runs}</td>
                <td className="px-4 py-3 text-xs">{user._count.domains}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
