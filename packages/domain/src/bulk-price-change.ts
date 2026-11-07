import { dzd, type Dzd, type MoneyError } from "./money.ts";
import { fail, type Result } from "./result.ts";

export type RoundingUnit = 1 | 5 | 10 | 50;

export type BulkPriceAdjustment =
  | { readonly kind: "percent"; readonly basisPoints: number }
  | { readonly kind: "fixed"; readonly amountDzd: number };

export interface BulkPriceChangeItem {
  readonly itemId: string;
  readonly priceDzd: Dzd;
}

export interface BulkPriceChangeInput {
  readonly items: readonly BulkPriceChangeItem[];
  readonly adjustment: BulkPriceAdjustment;
  readonly roundingUnit: RoundingUnit;
}

export interface BulkPriceChange {
  readonly itemId: string;
  readonly oldPriceDzd: Dzd;
  readonly newPriceDzd: Dzd;
}

export type BulkPriceChangeError = MoneyError | { readonly code: "invalid_bulk_price_change" };

const ROUNDING_UNITS: readonly RoundingUnit[] = [1, 5, 10, 50];
const MAX_ITEMS = 500;
const MAX_BASIS_POINTS = 100_000;
const MAX_FIXED_AMOUNT_DZD = 10_000_000;

function isValidAdjustment(adjustment: BulkPriceAdjustment): boolean {
  if (adjustment.kind === "percent") {
    return (
      Number.isInteger(adjustment.basisPoints) &&
      Math.abs(adjustment.basisPoints) <= MAX_BASIS_POINTS
    );
  }
  return (
    Number.isSafeInteger(adjustment.amountDzd) &&
    Math.abs(adjustment.amountDzd) <= MAX_FIXED_AMOUNT_DZD
  );
}

// Fraction (numerator / denominator) before rounding, so a single rounding step runs
// against the exact value instead of compounding error from an intermediate round.
function rawFraction(
  priceDzd: Dzd,
  adjustment: BulkPriceAdjustment,
): { readonly numerator: bigint; readonly denominator: bigint } {
  if (adjustment.kind === "fixed") {
    return { numerator: BigInt(priceDzd) + BigInt(adjustment.amountDzd), denominator: 1n };
  }
  return {
    numerator: BigInt(priceDzd) * BigInt(10_000 + adjustment.basisPoints),
    denominator: 10_000n,
  };
}

// Rounds numerator/denominator to the nearest multiple of unit, ties rounding up, then
// clamps a nonpositive result to zero to satisfy the items.price_dzd >= 0 constraint.
function roundToUnit(numerator: bigint, denominator: bigint, unit: RoundingUnit): number {
  if (numerator <= 0n) return 0;
  const unitDenominator = denominator * BigInt(unit);
  const unitsCount = (2n * numerator + unitDenominator) / (2n * unitDenominator);
  return Number(unitsCount) * unit;
}

function hasDuplicateItemId(items: readonly BulkPriceChangeItem[]): boolean {
  return new Set(items.map((item) => item.itemId)).size !== items.length;
}

export function previewBulkPriceChange(
  input: BulkPriceChangeInput,
): Result<readonly BulkPriceChange[], BulkPriceChangeError> {
  const { items, adjustment, roundingUnit } = input;
  if (items.length === 0 || items.length > MAX_ITEMS) return fail("invalid_bulk_price_change");
  if (!ROUNDING_UNITS.includes(roundingUnit)) return fail("invalid_bulk_price_change");
  if (!isValidAdjustment(adjustment)) return fail("invalid_bulk_price_change");
  if (hasDuplicateItemId(items)) return fail("invalid_bulk_price_change");

  const changes: BulkPriceChange[] = [];
  for (const item of items) {
    const { numerator, denominator } = rawFraction(item.priceDzd, adjustment);
    const newPrice = dzd(roundToUnit(numerator, denominator, roundingUnit));
    if (!newPrice.ok) return newPrice;
    changes.push({ itemId: item.itemId, oldPriceDzd: item.priceDzd, newPriceDzd: newPrice.value });
  }
  return { ok: true, value: changes };
}
