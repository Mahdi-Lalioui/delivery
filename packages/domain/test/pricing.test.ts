import fc from "fast-check";
import { assertDomainProperty } from "./property.ts";
import { expect, test } from "vitest";
import { dzd, type Dzd } from "../src/money.ts";
import { calculateChange, priceOrder } from "../src/pricing.ts";

type PricingInput = Parameters<typeof priceOrder>[0];
type Line = PricingInput["lines"][number];

const maximumDzd = Number.MAX_SAFE_INTEGER;
const invalidMoney = { ok: false, error: { code: "invalid_money" } };
const invalidPricing = { ok: false, error: { code: "invalid_pricing" } };

function money(value: number): Dzd {
  const amount = dzd(value);
  if (!amount.ok) throw new Error(`Invalid fixture amount ${String(value)}`);
  return amount.value;
}

function line(unitPriceDzd: number, quantity = 1, optionDeltasDzd: readonly number[] = []): Line {
  return { quantity, unitPriceDzd: money(unitPriceDzd), optionDeltasDzd };
}

function order(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    lines: [line(1_000)],
    minimumDzd: money(0),
    fulfillment: { kind: "pickup" },
    ...overrides,
  };
}

test.each([0, 1, maximumDzd])("[MON-01:domain] accepts %s as whole DZD", (value) => {
  expect(dzd(value)).toEqual({ ok: true, value });
});

test.each([-1, 0.25, NaN, Infinity, maximumDzd + 1])(
  "[MON-01:domain] rejects invalid DZD %s",
  (value) => {
    expect(dzd(value)).toEqual(invalidMoney);
  },
);

test("[MON-02] multiplies adjusted unit prices by quantity before summing lines", () => {
  const input = order({ lines: [line(100, 3, [-10, 25]), line(90, 2, [-5, 15])] });

  expect(priceOrder(input)).toMatchObject({ ok: true, value: { subtotalDzd: 545 } });
});

test("[MON-02] accepts twenty units and an option that makes an item free", () => {
  expect(priceOrder(order({ lines: [line(50, 20, [-50])] }))).toMatchObject({
    ok: true,
    value: { subtotalDzd: 0 },
  });
});

test.each([0, -1, 1.5, 21, NaN])("[MON-02] rejects invalid quantity %s", (quantity) => {
  expect(priceOrder(order({ lines: [line(100, quantity)] }))).toEqual(invalidPricing);
});

test("[MON-02] rejects an empty order", () => {
  expect(priceOrder(order({ lines: [] }))).toEqual(invalidPricing);
});

test.each([-101, 0.5, Infinity, maximumDzd])(
  "[MON-02] rejects invalid adjusted unit prices or option deltas %s",
  (deltaDzd) => {
    expect(priceOrder(order({ lines: [line(100, 1, [deltaDzd])] }))).toEqual(invalidMoney);
  },
);

test("[MON-02] rejects line multiplication and subtotal accumulation overflow", () => {
  expect(priceOrder(order({ lines: [line(maximumDzd, 2)] }))).toEqual(invalidMoney);
  expect(priceOrder(order({ lines: [line(maximumDzd), line(1)] }))).toEqual(invalidMoney);
});

test("[MON-02] rejects an invalid line even when another line covers its negative value", () => {
  expect(priceOrder(order({ lines: [line(100, 1, [-101]), line(200)] }))).toEqual(invalidMoney);
});

test.each([
  [104, 100, 10],
  [105, 100, 11],
  [105, 8, 8],
] as const)(
  "[MON-03] rounds 10%% on %i DZD half-up with a cap of %i DZD",
  (subtotalDzd, capDzd, discountDzd) => {
    const input = order({
      lines: [line(subtotalDzd)],
      promo: { kind: "percent", basisPoints: 1_000, capDzd: money(capDzd) },
    });

    expect(priceOrder(input)).toMatchObject({ ok: true, value: { discountDzd } });
  },
);

test("[MON-03] computes exact percentages near the safe-integer limit", () => {
  const input = order({
    lines: [line(maximumDzd)],
    promo: { kind: "percent", basisPoints: 116, capDzd: money(maximumDzd) },
  });

  expect(priceOrder(input)).toMatchObject({
    ok: true,
    value: { discountDzd: 104_483_511_354_995 },
  });
});

test.each([-1, 0.5, 10_001, NaN])("[MON-03] rejects invalid basis points %s", (basisPoints) => {
  expect(
    priceOrder(order({ promo: { kind: "percent", basisPoints, capDzd: money(100) } })),
  ).toEqual(invalidPricing);
});

test("[MON-03] caps fixed discounts at the subtotal", () => {
  const input = order({ promo: { kind: "fixed", amountDzd: money(2_000) } });

  expect(priceOrder(input)).toMatchObject({ ok: true, value: { discountDzd: 1_000, totalDzd: 0 } });
});

test("[MON-03] a free-delivery promotion waives only the delivery fee", () => {
  const input = order({
    promo: { kind: "free_delivery" },
    fulfillment: { kind: "delivery", roadMeters: 900, baseDzd: money(100), perKmDzd: money(20) },
  });

  expect(priceOrder(input)).toMatchObject({
    ok: true,
    value: { discountDzd: 0, deliveryFeeDzd: 0, totalDzd: 1_000 },
  });
});

test.each([
  [0, 80],
  [500, 90],
  [501, 100],
  [1_001, 110],
] as const)(
  "[MON-04] charges %i metres in half-kilometre steps, rounded to tens",
  (roadMeters, fee) => {
    const input = order({
      fulfillment: { kind: "delivery", roadMeters, baseDzd: money(75), perKmDzd: money(25) },
    });

    expect(priceOrder(input)).toMatchObject({ ok: true, value: { deliveryFeeDzd: fee } });
  },
);

test("[MON-04] rounds a fractional raw fee directly to the nearest ten", () => {
  const input = order({
    fulfillment: { kind: "delivery", roadMeters: 1, baseDzd: money(3), perKmDzd: money(3) },
  });

  expect(priceOrder(input)).toMatchObject({ ok: true, value: { deliveryFeeDzd: 0 } });
});

test.each([-1, 0.1, NaN, Infinity])("[MON-04] rejects invalid distance %s metres", (roadMeters) => {
  const input = order({
    fulfillment: { kind: "delivery", roadMeters, baseDzd: money(75), perKmDzd: money(25) },
  });

  expect(priceOrder(input)).toEqual(invalidPricing);
});

test.each([
  [500, 0],
  [501, 120],
] as const)(
  "[MON-04] compares the free-delivery threshold after a %i DZD discount",
  (discount, fee) => {
    const input = order({
      lines: [line(1_500)],
      promo: { kind: "fixed", amountDzd: money(discount) },
      fulfillment: {
        kind: "delivery",
        roadMeters: 1_000,
        baseDzd: money(100),
        perKmDzd: money(20),
        freeOverDzd: money(1_000),
      },
    });

    expect(priceOrder(input)).toMatchObject({ ok: true, value: { deliveryFeeDzd: fee } });
  },
);

test("[MON-05] returns only the subtotal, discount, pickup fee and total", () => {
  expect(priceOrder(order({ promo: { kind: "fixed", amountDzd: money(200) } }))).toEqual({
    ok: true,
    value: { subtotalDzd: 1_000, discountDzd: 200, deliveryFeeDzd: 0, totalDzd: 800 },
  });
});

test("[MON-05] rejects an overflowing delivery fee or total", () => {
  const fulfillment = { kind: "delivery", roadMeters: 2_000, baseDzd: money(100) } as const;
  expect(
    priceOrder(order({ fulfillment: { ...fulfillment, perKmDzd: money(maximumDzd) } })),
  ).toEqual(invalidMoney);
  expect(
    priceOrder(
      order({ lines: [line(maximumDzd)], fulfillment: { ...fulfillment, perKmDzd: money(0) } }),
    ),
  ).toEqual(invalidMoney);
});

test("[MON-06] checks the order minimum before applying the discount", () => {
  const input = order({
    minimumDzd: money(1_000),
    promo: { kind: "fixed", amountDzd: money(800) },
  });

  expect(priceOrder(input)).toMatchObject({ ok: true, value: { totalDzd: 200 } });
  expect(priceOrder({ ...input, minimumDzd: money(1_001) })).toMatchObject({
    ok: false,
    error: { code: "minimum_not_met" },
  });
});

test.each([
  [1_000, 1_000, 0],
  [1_000, 11_000, 10_000],
  [maximumDzd - 10, maximumDzd, 10],
] as const)("[MON-07:domain] accepts total %i and cash %i", (total, cash, change) => {
  expect(calculateChange({ totalDzd: money(total), payingWithDzd: money(cash) })).toEqual({
    ok: true,
    value: change,
  });
});

test.each([999, 11_001])("[MON-07:domain] rejects out-of-range cash %i", (cash) => {
  expect(calculateChange({ totalDzd: money(1_000), payingWithDzd: money(cash) })).toMatchObject({
    ok: false,
    error: { code: "invalid_change" },
  });
});

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  return (numerator % denominator) * 2n >= denominator ? quotient + 1n : quotient;
}

function expectedDiscount(promo: PricingInput["promo"], subtotal: bigint): bigint {
  if (promo?.kind === "fixed")
    return BigInt(promo.amountDzd) < subtotal ? BigInt(promo.amountDzd) : subtotal;
  if (promo?.kind !== "percent") return 0n;

  const rounded = roundHalfUp(subtotal * BigInt(promo.basisPoints), 10_000n);
  return [BigInt(promo.capDzd), subtotal].reduce(
    (limit, cap) => (limit < cap ? limit : cap),
    rounded,
  );
}

function expectedFee(input: PricingInput, netSubtotal: bigint): bigint {
  const { fulfillment, promo } = input;
  if (fulfillment.kind === "pickup" || promo?.kind === "free_delivery") return 0n;
  if (fulfillment.kind === "zone") return BigInt(fulfillment.feeDzd);
  if (fulfillment.freeOverDzd !== undefined && netSubtotal >= BigInt(fulfillment.freeOverDzd)) {
    return 0n;
  }

  const halfKilometers = (BigInt(fulfillment.roadMeters) + 499n) / 500n;
  const doubledFee =
    2n * BigInt(fulfillment.baseDzd) + halfKilometers * BigInt(fulfillment.perKmDzd);
  return 10n * roundHalfUp(doubledFee, 20n);
}

test("[MON-10] generated prices match an integer oracle for every amount @property", () => {
  const amounts = fc.integer({ min: 0, max: 20_000 }).map(money);
  const lines = fc.array(
    fc.record({
      quantity: fc.integer({ min: 1, max: 20 }),
      unitPriceDzd: fc.integer({ min: 100, max: 10_000 }).map(money),
      optionDeltasDzd: fc.array(fc.integer({ min: -20, max: 500 }), { maxLength: 5 }),
    }),
    { minLength: 1, maxLength: 6 },
  );
  const promo = fc.oneof(
    fc.constant(undefined),
    fc.constant({ kind: "free_delivery" } as const),
    fc.record({ kind: fc.constant("fixed" as const), amountDzd: amounts }),
    fc.record({
      kind: fc.constant("percent" as const),
      basisPoints: fc.integer({ min: 0, max: 10_000 }),
      capDzd: amounts,
    }),
  );
  const fulfillment = fc.oneof(
    fc.constant({ kind: "pickup" } as const),
    fc.record({ kind: fc.constant("zone" as const), feeDzd: amounts }),
    fc.record(
      {
        kind: fc.constant("delivery" as const),
        roadMeters: fc.integer({ min: 0, max: 50_000 }),
        baseDzd: amounts,
        perKmDzd: amounts,
        freeOverDzd: amounts,
      },
      { requiredKeys: ["kind", "roadMeters", "baseDzd", "perKmDzd"] },
    ),
  );

  assertDomainProperty(
    fc.property(fc.record({ lines, promo, fulfillment }), ({ lines, promo, fulfillment }) => {
      const input = order({ lines, fulfillment, ...(promo === undefined ? {} : { promo }) });
      const subtotal = lines.reduce((sum, item) => {
        const adjusted = item.optionDeltasDzd.reduce(
          (sum, delta) => sum + BigInt(delta),
          BigInt(item.unitPriceDzd),
        );
        return sum + BigInt(item.quantity) * adjusted;
      }, 0n);
      const discount = expectedDiscount(promo, subtotal);
      const netSubtotal = subtotal - discount;
      const fee = expectedFee(input, netSubtotal);

      expect(priceOrder(input)).toEqual({
        ok: true,
        value: {
          subtotalDzd: Number(subtotal),
          discountDzd: Number(discount),
          deliveryFeeDzd: Number(fee),
          totalDzd: Number(netSubtotal + fee),
        },
      });
    }),
  );
});
