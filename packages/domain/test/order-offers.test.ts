import { expect, test } from "vitest";
import { dzd } from "../src/money.ts";
import { selectOrderOffer } from "../src/pricing.ts";

function money(value: number) {
  const amount = dzd(value);
  if (!amount.ok) throw new Error("Invalid test amount");
  return amount.value;
}

const price = { subtotalDzd: money(501), deliveryFeeDzd: money(80) };
const fixed = { id: "first", promo: { kind: "fixed", amountDzd: money(50) } } as const;
const free = { id: "second", promo: { kind: "free_delivery" } } as const;
const capped = {
  id: "third",
  promo: { kind: "percent", basisPoints: 5000, capDzd: money(50) },
} as const;

test("[MON-03] chooses one automatic offer by total saving, including delivery", () => {
  expect(selectOrderOffer(price, [fixed, free, capped])).toBe(free);
  expect(selectOrderOffer({ ...price, deliveryFeeDzd: money(0) }, [free, capped, fixed])).toBe(
    fixed,
  );
});

test("[MON-03] an offer with no savings consumes no automatic redemption", () => {
  expect(selectOrderOffer({ ...price, deliveryFeeDzd: money(0) }, [free])).toBeUndefined();
});
