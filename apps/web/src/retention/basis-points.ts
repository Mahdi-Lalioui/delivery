// Percent ↔ basis points without float drift. Accepts "19", "19.5", "19,5" and at most two
// decimals; anything else is NaN so the contract rejects it instead of rounding silently.

export function percentToBasisPoints(value: string): number {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (match === null) return Number.NaN;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** Formats basis points as the percent text the parser accepts, e.g. 1950 → "19.5". */
export function basisPointsToPercent(basisPoints: number): string {
  const whole = Math.trunc(basisPoints / 100);
  const fraction = String(basisPoints % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return fraction === "" ? String(whole) : `${String(whole)}.${fraction}`;
}
