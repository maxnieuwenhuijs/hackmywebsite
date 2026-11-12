export type AssessmentTierId = "RECON" | "PENTEST" | "DEEP";

export type AssessmentTier = {
  id: AssessmentTierId;
  name: string;
  mode: "RECON" | "PENTEST";
  aggressive: boolean;
  minBudgetCents: number;
  briefings: string;
  summary: string;
  includes: string[];
  consent: boolean;
};

export const ASSESSMENT_TIERS: AssessmentTier[] = [
  {
    id: "RECON",
    name: "Recon",
    mode: "RECON",
    aggressive: false,
    minBudgetCents: 5_000,
    briefings: "1 live briefing",
    summary: "Map the attack surface without changing anything.",
    includes: ["Route and endpoint map", "Auth boundaries", "One live briefing", "Sealed final report"],
    consent: false,
  },
  {
    id: "PENTEST",
    name: "Pentest",
    mode: "PENTEST",
    aggressive: false,
    minBudgetCents: 20_000,
    briefings: "2 live briefings",
    summary: "Actively probe for access-control and injection flaws.",
    includes: ["Recon coverage", "Read-only exploitation", "Two live briefings", "Sealed final report"],
    consent: false,
  },
  {
    id: "DEEP",
    name: "Deep",
    mode: "PENTEST",
    aggressive: true,
    minBudgetCents: 50_000,
    briefings: "3 live briefings",
    summary: "Full swarm with consent-based proof of impact.",
    includes: ["Full swarm", "Consent-based writes on own objects", "Three live briefings", "Sealed final report"],
    consent: true,
  },
];

export const MIN_TOPUP_CENTS = 5_000;
export const TOPUP_PRESETS = [5_000, 20_000, 50_000, 100_000, 250_000];

export function getTier(id: string): AssessmentTier | null {
  return ASSESSMENT_TIERS.find((tier) => tier.id === id) ?? null;
}

export function briefingThresholds(budgetCents: number): number[] {
  if (budgetCents < 20_000) return [50];
  if (budgetCents < 50_000) return [33, 66];
  return [25, 50, 75];
}

export function briefingCount(budgetCents: number): number {
  return briefingThresholds(budgetCents).length;
}

export function availableWalletCents(wallet: { balanceCents: number; heldCents: number } | null): number {
  if (!wallet) return 0;
  return Math.max(0, wallet.balanceCents - wallet.heldCents);
}

export function formatBudget(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US")}`;
}
