export const MARKUP = 12.5;
export const MIN_BUDGET_CENTS = 5_000;
export const MAX_BUDGET_CENTS = 1_000_000;
export const CLEAN_FEE_CENTS = 1_500;
export const CREDIT_EXPIRY_DAYS = 42;
export const CLEAN_REVIEW_THRESHOLD_CENTS = 25_000;

export function internalCapCents(customerBudgetCents: number): number {
  if (customerBudgetCents < MIN_BUDGET_CENTS || customerBudgetCents > MAX_BUDGET_CENTS) {
    throw new Error("budget outside allowed range");
  }
  return Math.floor(customerBudgetCents / MARKUP);
}

export function chargeCents(internalCostCents: number): number {
  return Math.ceil(internalCostCents * MARKUP);
}

export function cleanKeepCents(chargedCents: number): number {
  return Math.min(chargedCents, CLEAN_FEE_CENTS);
}

export function cleanCreditCents(chargedCents: number): number {
  return Math.max(0, chargedCents - cleanKeepCents(chargedCents));
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
