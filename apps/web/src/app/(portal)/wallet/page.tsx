import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatUsd } from "@/lib/pricing";
import { availableWalletCents, MIN_TOPUP_CENTS, TOPUP_PRESETS } from "@/lib/assessments";
import { Icon } from "@/components/icon";
import { topUpAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ topup?: string; error?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  const [lots, payments, ledger] = await Promise.all([
    prisma.creditLot.findMany({ where: { userId: user.id }, orderBy: { expiresAt: "asc" } }),
    prisma.payment.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.ledgerEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const available = availableWalletCents(wallet);
  const dev = process.env.ALLOW_DEV_PAYMENTS === "1" && !process.env.STRIPE_SECRET_KEY;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-700">Wallet</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Prepaid balance.</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Top up once. A run holds its budget cap and only uses what it needs. Unused budget stays on the account until it expires.
          </p>
        </div>
      </div>

      {params.topup === "success" ? (
        <div className="mt-6 flex gap-3 rounded-[2px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <Icon name="check_circle" size={18} />
          Balance added. You can start an assessment now.
        </div>
      ) : null}
      {params.error ? (
        <div className="mt-6 flex gap-3 rounded-[2px] border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <Icon name="error" size={18} />
          {params.error === "payments" ? "Payments are not configured." : params.error === "rate" ? "Too many top-up attempts. Try again in a few minutes." : "Choose a top-up of at least $50."}
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="space-y-6">
          <div className="rounded-[2px] border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">Available now</p>
                <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">{formatUsd(available)}</p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <p>Balance {formatUsd(wallet?.balanceCents || 0)}</p>
                <p className="mt-1">Held {formatUsd(wallet?.heldCents || 0)}</p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {TOPUP_PRESETS.map((cents) => (
                <form key={cents} action={topUpAction}>
                  <input type="hidden" name="amountCents" value={cents} />
                  <button className="rounded-[2px] border border-slate-300 px-4 py-2.5 font-mono text-sm text-slate-700 hover:border-slate-500" type="submit">
                    Add {formatUsd(cents)}
                  </button>
                </form>
              ))}
            </div>
            <form action={topUpAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
              <label className="block">
                <span className="text-xs font-medium text-slate-700">Custom amount (USD)</span>
                <input name="amountUsd" type="number" min={MIN_TOPUP_CENTS / 100} step="1" placeholder="250" className="mt-1.5 w-40 rounded-[2px] border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-700" required />
              </label>
              <button className="rounded-[2px] bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800" type="submit">Add balance</button>
              <span className="pb-2 text-xs text-slate-500">Minimum $50. {dev ? "Dev payment is enabled." : "Secure checkout."}</span>
            </form>
          </div>

          <div className="rounded-[2px] border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Credit lots</h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">42 day expiry</span>
            </div>
            {lots.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500">No credit lots yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {lots.map((lot) => (
                  <div key={lot.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <div>
                      <p className="font-medium text-slate-900">{formatUsd(lot.remainingCents)} left</p>
                      <p className="text-xs text-slate-500">from {formatUsd(lot.cents)} · {lot.source}</p>
                    </div>
                    <p className="text-xs text-slate-500">expires {lot.expiresAt.toLocaleDateString("en-GB")}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[2px] border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Ledger</h2>
            </div>
            {ledger.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500">No transactions yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {ledger.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <div>
                      <p className="font-medium text-slate-900">{entry.kind}</p>
                      <p className="text-xs text-slate-500">{entry.createdAt.toLocaleString("en-GB")}</p>
                    </div>
                    <p className={entry.amountCents >= 0 ? "font-mono text-emerald-700" : "font-mono text-slate-600"}>
                      {entry.amountCents >= 0 ? "+" : ""}{formatUsd(entry.amountCents)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-[2px] border border-slate-200 bg-white p-5">
            <Icon name="info" size={20} className="text-blue-700" />
            <h2 className="mt-3 text-sm font-semibold text-slate-900">How the cap works</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              The budget is a cap, not a fixed fee. The run holds it while active and releases anything unused when it completes. A clean result credits back the charge minus a $15 assessment fee.
            </p>
          </div>
          <div className="rounded-[2px] border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Payment history</h2>
            {payments.length === 0 ? <p className="mt-2 text-sm text-slate-500">No payments yet.</p> : (
              <div className="mt-3 space-y-2">
                {payments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{payment.provider} · {payment.createdAt.toLocaleDateString("en-GB")}</span>
                    <span className="font-mono text-slate-700">{formatUsd(payment.amountCents)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
