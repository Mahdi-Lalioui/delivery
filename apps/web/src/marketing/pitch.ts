// DESIGN §7.1-8 restaurant pitch: what a typical 20–30% commission app would take compared with
// the flat monthly fee (BIL-01). Whole dinars only.

export const pitchRanges = {
  ordersPerDay: { min: 1, max: 300, step: 1, initial: 20 },
  averageTicketDzd: { min: 300, max: 10_000, step: 50, initial: 1500 },
} as const;

const daysPerMonth = 30;
const lowRateBasisPoints = 2000;
const highRateBasisPoints = 3000;

function clamp(value: number, range: { min: number; max: number }): number {
  if (!Number.isFinite(value)) return range.min;
  return Math.min(range.max, Math.max(range.min, Math.round(value)));
}

function commission(salesDzd: number, basisPoints: number): number {
  return Math.round((salesDzd * basisPoints) / 10_000);
}

export function pitchComparison(input: {
  ordersPerDay: number;
  averageTicketDzd: number;
  flatFeeDzd: number;
}) {
  const ordersPerDay = clamp(input.ordersPerDay, pitchRanges.ordersPerDay);
  const averageTicketDzd = clamp(input.averageTicketDzd, pitchRanges.averageTicketDzd);
  const monthlySalesDzd = ordersPerDay * averageTicketDzd * daysPerMonth;
  const commissionLowDzd = commission(monthlySalesDzd, lowRateBasisPoints);
  return {
    monthlySalesDzd,
    commissionLowDzd,
    commissionHighDzd: commission(monthlySalesDzd, highRateBasisPoints),
    flatFeeDzd: input.flatFeeDzd,
    savingsLowDzd: Math.max(0, commissionLowDzd - input.flatFeeDzd),
  };
}
