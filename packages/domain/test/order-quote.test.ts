import { expect, test } from "vitest";
import { priceCashQuote } from "../src/order-quote.ts";

const line = {
  item: { itemId: "couscous", names: { fr: "Couscous" }, priceDzd: 500, isAvailable: true },
  quantity: 2,
  optionIds: ["large"],
  note: "Sans sel",
  groups: [
    {
      optionGroupId: "size",
      names: { fr: "Taille" },
      minimum: 1,
      maximum: 1,
      options: [
        { optionId: "large", names: { fr: "Grand" }, priceDeltaDzd: 50, isAvailable: true },
      ],
    },
  ],
};

test("[MON-02:domain] uses server item and option prices and snapshots names and notes", () => {
  expect(
    priceCashQuote({
      lines: [line],
      minimumDzd: 1000,
      fulfilment: { kind: "delivery", feeDzd: 137 },
    }),
  ).toMatchObject({
    ok: true,
    value: {
      subtotalDzd: 1100,
      deliveryFeeDzd: 137,
      totalDzd: 1237,
      lines: [
        {
          itemId: "couscous",
          names: { fr: "Couscous" },
          unitPriceDzd: 500,
          quantity: 2,
          note: "Sans sel",
          options: [{ optionId: "large", names: { fr: "Grand" }, priceDeltaDzd: 50 }],
        },
      ],
    },
  });
});

test("[CUS-13:domain] pickup has zero fee and minimum applies before the delivery fee", () => {
  expect(
    priceCashQuote({ lines: [line], minimumDzd: 1100, fulfilment: { kind: "pickup" } }),
  ).toMatchObject({ ok: true, value: { subtotalDzd: 1100, deliveryFeeDzd: 0, totalDzd: 1100 } });
  expect(
    priceCashQuote({
      lines: [line],
      minimumDzd: 1150,
      fulfilment: { kind: "delivery", feeDzd: 137 },
    }),
  ).toEqual({ ok: false, error: { code: "minimum_not_met" } });
});

test.each(
  [[], ["foreign"], ["large", "foreign"], ["large", "large"]].map((optionIds) => ({ optionIds })),
)(
  "[CUS-08:domain] rejects missing, foreign or duplicate selections $optionIds",
  ({ optionIds }) => {
    expect(
      priceCashQuote({
        lines: [{ ...line, optionIds }],
        minimumDzd: 0,
        fulfilment: { kind: "pickup" },
      }),
    ).toEqual({ ok: false, error: { code: "invalid_options" } });
  },
);

test("[ORD-06:domain] refuses unavailable items and invalid money before writing a snapshot", () => {
  const input = { minimumDzd: 0, fulfilment: { kind: "pickup" } } as const;
  expect(
    priceCashQuote({ ...input, lines: [{ ...line, item: { ...line.item, isAvailable: false } }] }),
  ).toEqual({ ok: false, error: { code: "item_unavailable" } });
  expect(
    priceCashQuote({
      ...input,
      lines: [{ ...line, item: { ...line.item, priceDzd: 2_147_483_647 } }],
    }),
  ).toEqual({ ok: false, error: { code: "invalid_money" } });
  expect(
    priceCashQuote({ ...input, lines: [line], fulfilment: { kind: "delivery", feeDzd: 0.5 } }),
  ).toEqual({ ok: false, error: { code: "invalid_money" } });
});
