import Link from "next/link";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { ASSESSMENT_TIERS, availableWalletCents, briefingCount, formatBudget } from "@/lib/assessments";
import { formatUsd } from "@/lib/pricing";
import { Icon } from "@/components/icon";
import { createAssessmentAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewAssessmentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const [wallet, domains] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId: user.id } }),
    prisma.domain.findMany({ where: { userId: user.id, status: "VERIFIED" }, orderBy: { hostname: "asc" } }),
  ]);
  const available = availableWalletCents(wallet);
  const canStart = available >= 5_000 && domains.length > 0;

  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-700">New assessment</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Choose the depth.</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
        The budget is a cap. We hold it while the run is active and release what is unused. The final report is sealed for your key.
      </p>

      {params.error ? (
        <div className="mt-6 flex gap-3 rounded-[2px] border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <Icon name="error" size={18} />
          {params.error === "balance" ? "Add balance first." : params.error === "domain" ? "Verify a domain first." : params.error === "consent" ? "Deep requires explicit consent." : params.error === "budget" ? "Choose a budget at or above the tier minimum." : params.error === "rate" ? "Too many assessment attempts. Try again later." : "Check the form and try again."}
        </div>
      ) : null}

      {!canStart ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-[2px] border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-semibold text-amber-900">Balance</p>
            <p className="mt-1 text-sm text-amber-800">Available {formatUsd(available)}. Minimum top-up is $50.</p>
            <Link className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-amber-900 underline" href="/wallet">Add balance <Icon name="arrow_forward" size={15} /></Link>
          </div>
          <div className="rounded-[2px] border border-blue-200 bg-blue-50 p-5">
            <p className="text-sm font-semibold text-blue-900">Verified domain</p>
            <p className="mt-1 text-sm text-blue-800">A target needs one verified domain before it can be queued.</p>
            <Link className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-blue-900 underline" href="/domains">Verify a domain <Icon name="arrow_forward" size={15} /></Link>
          </div>
        </div>
      ) : (
        <form action={createAssessmentAction} className="mt-8 space-y-6">
          <section className="rounded-[2px] border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-slate-900">1. Target</h2>
            <p className="mt-1 text-xs text-slate-500">Only domains you verified are available.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {domains.map((domain) => (
                <label key={domain.id} className="flex cursor-pointer items-center gap-3 rounded-[2px] border border-slate-200 p-3 text-sm has-[:checked]:border-blue-700 has-[:checked]:bg-blue-50">
                  <input type="radio" name="domainId" value={domain.id} required defaultChecked={domains.length === 1} />
                  <span>
                    <span className="block font-medium text-slate-900">{domain.hostname}</span>
                    <span className="block text-xs text-slate-500">verified {domain.verifiedAt?.toLocaleDateString("en-GB")}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-[2px] border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-slate-900">2. Depth</h2>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {ASSESSMENT_TIERS.map((tier, index) => (
                <label key={tier.id} className="cursor-pointer rounded-[2px] border border-slate-200 p-4 has-[:checked]:border-blue-700 has-[:checked]:bg-blue-50">
                  <input type="radio" name="tier" value={tier.id} required defaultChecked={index === 1} />
                  <span className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{tier.name}</span>
                    <span className="font-mono text-[10px] text-slate-500">{formatBudget(tier.minBudgetCents)}+</span>
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-slate-500">{tier.summary}</span>
                  <span className="mt-3 block font-mono text-[10px] uppercase tracking-[0.1em] text-blue-700">{tier.briefings}</span>
                  <span className="mt-2 block text-[11px] text-slate-400">{tier.includes.join(" · ")}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-[2px] border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-slate-900">3. Budget cap</h2>
            <p className="mt-1 text-xs text-slate-500">Available {formatUsd(available)}. Briefings: {briefingCount(100_000)} at the largest tier. The final report is always included.</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <span className="font-mono">$</span>
                <input name="budgetUsd" type="number" min="50" step="1" required placeholder="200" className="w-32 rounded-[2px] border border-slate-300 px-3 py-2.5 font-mono text-sm outline-none focus:border-blue-700" />
              </label>
              <span className="text-xs text-slate-500">Minimum depends on the tier. Unused balance stays on your account.</span>
            </div>
            <label className="mt-5 flex items-start gap-3 text-xs leading-5 text-slate-600">
              <input name="consent" type="checkbox" className="mt-0.5" />
              <span>I authorize this assessment. Deep runs may change only objects they create and must revert them. I understand the budget is a cap.</span>
            </label>
          </section>

          <button className="inline-flex items-center gap-2 rounded-[2px] bg-blue-700 px-5 py-3 text-sm font-medium text-white hover:bg-blue-800" type="submit">
            Queue assessment
            <Icon name="arrow_forward" size={16} />
          </button>
        </form>
      )}
    </div>
  );
}
