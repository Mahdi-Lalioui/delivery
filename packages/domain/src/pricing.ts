import { dzd, type Dzd, type MoneyError } from "./money.ts";
import { fail, type Result } from "./result.ts";

interface Line {
  readonly quantity: number;
  readonly unitPriceDzd: Dzd;
  readonly optionDeltasDzd: readonly number[];
}

type Promo =
  | { readonly kind: "percent"; readonly basisPoints: number; readonly capDzd: Dzd }
  | { readonly kind: "fixed"; readonly amountDzd: Dzd }
  | { readonly kind: "free_delivery" };

type Fulfillment =
  | { readonly kind: "pickup" }
  | { readonly kind: "zone"; readonly feeDzd: Dzd }
  | {
      readonly kind: "delivery";
      readonly roadMeters: number;
      readonly baseDzd: Dzd;
      readonly perKmDzd: Dzd;
      readonly freeOverDzd?: Dzd;
    };

interface PricingInput {
  readonly lines: readonly Line[];
  readonly minimumDzd: Dzd;
  readonly promo?: Promo;
  readonly fulfillment: Fulfillment;
}

interface Price {
  readonly subtotalDzd: Dzd;
  readonly discountDzd: Dzd;
  readonly deliveryFeeDzd: Dzd;
  readonly totalDzd: Dzd;
}

type AmountError = MoneyError | { readonly code: "invalid_pricing" };
type PricingError = AmountError | { readonly code: "minimum_not_met" };

function lineAmount(line: Line): Result<bigint, AmountError> {
  if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20) {
    return fail("invalid_pricing");
  }
  if (!line.optionDeltasDzd.every(Number.isSafeInteger)) return fail("invalid_money");
  const unitDzd = line.optionDeltasDzd.reduce(
    (sum, deltaDzd) => sum + BigInt(deltaDzd),
    BigInt(line.unitPriceDzd),
  );
  if (unitDzd < 0n) return fail("invalid_money");
  return { ok: true, value: unitDzd * BigInt(line.quantity) };
}

function subtotal(lines: readonly Line[]): Result<Dzd, AmountError> {
  if (lines.length === 0) return fail("invalid_pricing");
  let amountDzd = 0n;
  for (const line of lines) {
    const amount = lineAmount(line);
    if (!amount.ok) return amount;
    amountDzd += amount.value;
  }
  return dzd(Number(amountDzd));
}

function discount(subtotalDzd: Dzd, promo: Promo | undefined): Result<Dzd, AmountError> {
  if (!promo || promo.kind === "free_delivery") return dzd(0);
  if (promo.kind === "fixed") return dzd(Math.min(subtotalDzd, promo.amountDzd));
  const { basisPoints, capDzd } = promo;
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    return fail("invalid_pricing");
  }
  const roundedDzd = (BigInt(subtotalDzd) * BigInt(basisPoints) + 5_000n) / 10_000n;
  return dzd(Math.min(Number(roundedDzd), capDzd));
}

/** Select the greatest positive automatic saving, with stable IDs breaking ties. */
export function selectOrderOffer<T extends { id: string; promo: Promo }>(
  price: Pick<Price, "subtotalDzd" | "deliveryFeeDzd">,
  offers: readonly T[],
): T | undefined {
  let best: T | undefined;
  let bestSaving = 0;
  for (const offer of offers) {
    const reduction = discount(price.subtotalDzd, offer.promo);
    if (!reduction.ok) continue;
    const saving = offer.promo.kind === "free_delivery" ? price.deliveryFeeDzd : reduction.value;
    if (saving > bestSaving || (saving === bestSaving && best && offer.id < best.id)) {
      best = offer;
      bestSaving = saving;
    }
  }
  return best;
}

function deliveryFee(input: {
  readonly fulfillment: Fulfillment;
  readonly netSubtotalDzd: number;
  readonly hasFreeDelivery: boolean;
}): Result<Dzd, AmountError> {
  const { fulfillment, netSubtotalDzd, hasFreeDelivery } = input;
  if (fulfillment.kind === "pickup") return dzd(0);
  if (fulfillment.kind === "zone") return hasFreeDelivery ? dzd(0) : dzd(fulfillment.feeDzd);
  const { roadMeters, baseDzd, perKmDzd, freeOverDzd } = fulfillment;
  if (!Number.isSafeInteger(roadMeters) || roadMeters < 0) return fail("invalid_pricing");
  if (hasFreeDelivery || (freeOverDzd !== undefined && netSubtotalDzd >= freeOverDzd)) {
    return dzd(0);
  }
  const halfKilometers = (BigInt(roadMeters) + 499n) / 500n;
  const doubledDzd = 2n * BigInt(baseDzd) + halfKilometers * BigInt(perKmDzd);
  return dzd(Number(((doubledDzd + 10n) / 20n) * 10n));
}

export function priceOrder(input: PricingInput): Result<Price, PricingError> {
  const sum = subtotal(input.lines);
  if (!sum.ok) return sum;
  if (sum.value < input.minimumDzd) return fail("minimum_not_met");
  const reduction = discount(sum.value, input.promo);
  if (!reduction.ok) return reduction;
  const netSubtotalDzd = sum.value - reduction.value;
  const fee = deliveryFee({
    fulfillment: input.fulfillment,
    netSubtotalDzd,
    hasFreeDelivery: input.promo?.kind === "free_delivery",
  });
  if (!fee.ok) return fee;
  const total = dzd(netSubtotalDzd + fee.value);
  if (!total.ok) return total;
  return {
    ok: true,
    value: {
      subtotalDzd: sum.value,
      discountDzd: reduction.value,
      deliveryFeeDzd: fee.value,
      totalDzd: total.value,
    },
  };
}

export function calculateChange(input: {
  readonly totalDzd: Dzd;
  readonly payingWithDzd: Dzd;
}): Result<Dzd, MoneyError | { readonly code: "invalid_change" }> {
  const changeDzd = input.payingWithDzd - input.totalDzd;
  if (changeDzd < 0 || changeDzd > 10_000) return fail("invalid_change");
  return dzd(changeDzd);
}
