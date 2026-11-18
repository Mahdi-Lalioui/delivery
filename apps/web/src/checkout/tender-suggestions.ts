import { isTenderInRange } from "./use-checkout";

const notes = [500, 1000, 2000, 5000] as const;

function roundUp(amountDzd: number, stepDzd: number): number {
  return Math.ceil(amountDzd / stepDzd) * stepDzd;
}

/**
 * CUS-14: one tap instead of typing. The exact total first, then the amounts a diner is likely
 * to hand over (the next 500, 1 000, 2 000 or 5 000 above it), four at most, all accepted.
 */
export function tenderSuggestions(totalDzd: number): number[] {
  const amounts = new Set<number>([totalDzd]);
  for (const note of notes) {
    const amount = roundUp(totalDzd + 1, note);
    if (isTenderInRange(amount, totalDzd)) amounts.add(amount);
    if (amounts.size === 4) break;
  }
  return [...amounts];
}
