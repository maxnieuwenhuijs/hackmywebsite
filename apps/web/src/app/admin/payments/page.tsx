import { prisma } from "@/lib/db";
import { formatUsd } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  const payments = await prisma.payment.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { email: true } } } });
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Payments</h1>
      <p className="mt-2 text-sm text-slate-500">Top-ups and provider state.</p>
      <div className="mt-6 overflow-x-auto rounded-[2px] border border-slate-200 bg-white">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Created</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td className="px-4 py-3 text-xs text-slate-600">{payment.user.email}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{payment.provider}</td>
                <td className="px-4 py-3 font-mono text-xs">{formatUsd(payment.amountCents)}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{payment.status}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{payment.createdAt.toLocaleString("en-GB")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
