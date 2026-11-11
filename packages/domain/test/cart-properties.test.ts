import fc from "fast-check";
import { expect, test } from "vitest";
import {
  addCartLine,
  configureCartLine,
  getCartSummary,
  readPersistedCart,
  type Cart,
} from "../src/cart.ts";
import { assertDomainProperty } from "./property.ts";

const now = 10_000;
const maximumDzd = BigInt(Number.MAX_SAFE_INTEGER);

test("[CUS-08] [CUS-09] generated cart amounts match a BigInt oracle without overflow @property", () => {
  assertDomainProperty(
    fc.property(
      fc.array(
        fc.record({
          baseDzd: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
          deltaDzd: fc.integer({ min: 0, max: 100_000 }),
          quantity: fc.integer({ min: 1, max: 20 }),
        }),
        { minLength: 1, maxLength: 8 },
      ),
      fc.integer({ min: 0, max: 100_000 }),
      (entries, minimumDzd) => {
        let cart: Cart | null = null;
        let totalDzd = 0n;
        let itemCount = 0;
        for (const [index, entry] of entries.entries()) {
          const lineDzd = (BigInt(entry.baseDzd) + BigInt(entry.deltaDzd)) * BigInt(entry.quantity);
          const configured = configureCartLine({
            lineId: `line-${String(index)}`,
            item: {
              itemId: "dish",
              names: { fr: "Dish" },
              priceDzd: entry.baseDzd,
              isAvailable: true,
            },
            optionGroups: [
              {
                optionGroupId: "extra",
                names: { fr: "Extra" },
                minimum: 0,
                maximum: 1,
                options: [
                  {
                    optionId: "cheese",
                    names: { fr: "Cheese" },
                    priceDeltaDzd: entry.deltaDzd,
                    isAvailable: true,
                  },
                ],
              },
            ],
            selections: [{ optionGroupId: "extra", optionIds: ["cheese"] }],
            quantity: entry.quantity,
            note: "",
          });
          if (lineDzd > maximumDzd) {
            expect(configured).toEqual({ ok: false, error: { code: "invalid_money" } });
            return;
          }
          if (!configured.ok) throw new Error(configured.error.code);
          const added = addCartLine({
            cart,
            merchant: { merchantId: "restaurant", name: "Restaurant", minimumDzd },
            line: configured.value,
            now,
          });
          totalDzd += lineDzd;
          itemCount += entry.quantity;
          if (totalDzd > maximumDzd) {
            expect(added).toEqual({ ok: false, error: { code: "invalid_money" } });
            return;
          }
          if (!added.ok) throw new Error(added.error.code);
          cart = added.value;
          expect(getCartSummary(cart)).toEqual({
            ok: true,
            value: {
              subtotalDzd: Number(totalDzd),
              itemCount,
              remainingMinimumDzd: Number(
                BigInt(minimumDzd) > totalDzd ? BigInt(minimumDzd) - totalDzd : 0n,
              ),
            },
          });
          const persisted: unknown = JSON.parse(JSON.stringify(cart));
          expect(readPersistedCart({ value: persisted, now })).toEqual({ ok: true, value: cart });
        }
      },
    ),
  );
});

test("[CUS-09] arbitrary local JSON cannot throw or become an unsafe cart @property", () => {
  assertDomainProperty(
    fc.property(fc.jsonValue(), (value) => {
      const result = readPersistedCart({ value, now });
      if (!result.ok || result.value === null) return;
      expect(getCartSummary(result.value).ok).toBe(true);
      expect(result.value.expiresAt).toBeGreaterThan(now);
      expect(result.value.expiresAt).toBeLessThanOrEqual(now + 604_800_000);
    }),
  );
});
