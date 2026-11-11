import { expect, test } from "vitest";
import {
  addCartLine,
  configureCartLine,
  getCartSummary,
  readPersistedCart,
  removeCartLine,
  setCartQuantity,
  type Cart,
  type CartLine,
} from "../src/cart.ts";

const now = 1_000_000;
const week = 604_800_000;
const merchant = { merchantId: "merchant-a", name: "Test restaurant", minimumDzd: 1_000 };
const item = { itemId: "item-a", names: { fr: "Sandwich" }, priceDzd: 400, isAvailable: true };
const optionGroups = [
  {
    optionGroupId: "size",
    names: { fr: "Size" },
    minimum: 1,
    maximum: 1,
    options: [
      { optionId: "large", names: { fr: "Large" }, priceDeltaDzd: 50, isAvailable: true },
      { optionId: "small", names: { fr: "Small" }, priceDeltaDzd: 0, isAvailable: true },
      {
        optionId: "unavailable",
        names: { fr: "Unavailable" },
        priceDeltaDzd: 20,
        isAvailable: false,
      },
    ],
  },
];

function configured(overrides: Partial<Parameters<typeof configureCartLine>[0]> = {}): CartLine {
  const result = configureCartLine({
    lineId: "line-a",
    item,
    optionGroups,
    selections: [{ optionGroupId: "size", optionIds: ["large"] }],
    quantity: 2,
    note: "No onion",
    ...overrides,
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

function cart(): Cart {
  const result = addCartLine({ cart: null, merchant, line: configured(), now });
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

test("[CUS-08] snapshots the configured item and calculates exact option totals", () => {
  const line = configured();
  expect(line).toEqual({
    lineId: "line-a",
    itemId: "item-a",
    names: { fr: "Sandwich" },
    unitPriceDzd: 400,
    options: [
      {
        optionGroupId: "size",
        groupNames: { fr: "Size" },
        optionId: "large",
        names: { fr: "Large" },
        priceDeltaDzd: 50,
      },
    ],
    quantity: 2,
    note: "No onion",
  });
  expect(getCartSummary(cart())).toEqual({
    ok: true,
    value: {
      subtotalDzd: 900,
      remainingMinimumDzd: 100,
      itemCount: 2,
    },
  });
  expect(line.names).not.toBe(item.names);
  expect(line.options[0]?.names).not.toBe(optionGroups[0]?.options[0]?.names);
});

test.each(
  [
    [],
    [{ optionGroupId: "size", optionIds: [] }],
    [{ optionGroupId: "size", optionIds: ["large", "small"] }],
    [{ optionGroupId: "size", optionIds: ["large", "large"] }],
    [{ optionGroupId: "size", optionIds: ["missing"] }],
    [{ optionGroupId: "size", optionIds: ["unavailable"] }],
    [{ optionGroupId: "missing", optionIds: ["large"] }],
    [
      { optionGroupId: "size", optionIds: ["large"] },
      { optionGroupId: "size", optionIds: ["small"] },
    ],
  ].map((selections) => ({ selections })),
)(
  "[CUS-08] rejects missing, excessive, duplicate, unknown or unavailable selections $selections",
  ({ selections }) => {
    expect(
      configureCartLine({
        lineId: "line",
        item,
        optionGroups,
        selections,
        quantity: 1,
        note: "",
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid_options" } });
  },
);

test("[CUS-07] refuses a sold-out item", () => {
  expect(
    configureCartLine({
      lineId: "line",
      item: { ...item, isAvailable: false },
      optionGroups: [],
      selections: [],
      quantity: 1,
      note: "",
    }),
  ).toMatchObject({ ok: false, error: { code: "item_unavailable" } });
});

test.each([0, 21, 1.5, NaN, Infinity])("[CUS-08] refuses invalid quantity %s", (quantity) => {
  expect(
    configureCartLine({
      lineId: "line",
      item,
      optionGroups: [],
      selections: [],
      quantity,
      note: "",
    }),
  ).toMatchObject({ ok: false, error: { code: "invalid_quantity" } });
});

test("[CUS-08] permits twenty units and a 140-character note but rejects a longer note", () => {
  expect(configured({ quantity: 20, note: "x".repeat(140) })).toMatchObject({ quantity: 20 });
  expect(
    configureCartLine({
      lineId: "line",
      item,
      optionGroups: [],
      selections: [],
      quantity: 1,
      note: "x".repeat(141),
    }),
  ).toMatchObject({ ok: false, error: { code: "invalid_note" } });
});

test.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  "[CUS-08] rejects unsafe base price %s",
  (priceDzd) => {
    expect(
      configureCartLine({
        lineId: "line",
        item: { ...item, priceDzd },
        optionGroups: [],
        selections: [],
        quantity: 1,
        note: "",
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid_money" } });
  },
);

test("[CUS-08] rejects invalid or overflowing option totals and quantity multiplication", () => {
  for (const priceDeltaDzd of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER]) {
    expect(
      configureCartLine({
        lineId: "line",
        item,
        optionGroups: [
          {
            ...optionGroups[0],
            optionGroupId: "size",
            names: {},
            minimum: 1,
            maximum: 1,
            options: [{ optionId: "large", names: {}, priceDeltaDzd, isAvailable: true }],
          },
        ],
        selections: [{ optionGroupId: "size", optionIds: ["large"] }],
        quantity: 1,
        note: "",
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid_money" } });
  }
  expect(
    configureCartLine({
      lineId: "line",
      item: { ...item, priceDzd: Number.MAX_SAFE_INTEGER },
      optionGroups: [],
      selections: [],
      quantity: 2,
      note: "",
    }),
  ).toMatchObject({ ok: false });
});

test("[CUS-09] requires explicit confirmation before replacing another restaurant's cart", () => {
  const original = cart();
  const nextMerchant = { ...merchant, merchantId: "merchant-b", name: "Other" };
  expect(
    addCartLine({ cart: original, merchant: nextMerchant, line: configured(), now: now + 1 }),
  ).toEqual({ ok: false, error: { code: "merchant_change_required" } });
  expect(original.lines).toHaveLength(1);
  expect(
    addCartLine({
      cart: original,
      merchant: nextMerchant,
      line: configured(),
      now: now + 1,
      confirmMerchantChange: true,
    }),
  ).toMatchObject({
    ok: true,
    value: {
      merchant: nextMerchant,
      lines: [configured()],
      expiresAt: now + 1 + week,
    },
  });
});

test("[CUS-09] appends distinct lines, edits quantities, removes and clears the last line", () => {
  const original = cart();
  const added = addCartLine({
    cart: original,
    merchant,
    line: configured({ lineId: "line-b" }),
    now: now + 1,
  });
  if (!added.ok) throw new Error(added.error.code);
  expect(added.value.lines).toHaveLength(2);
  const edited = setCartQuantity({
    cart: added.value,
    lineId: "line-a",
    quantity: 3,
    now: now + 2,
  });
  if (!edited.ok) throw new Error(edited.error.code);
  expect(getCartSummary(edited.value)).toMatchObject({
    ok: true,
    value: {
      subtotalDzd: 2_250,
      remainingMinimumDzd: 0,
      itemCount: 5,
    },
  });
  expect(original.lines[0]?.quantity).toBe(2);
  expect(removeCartLine({ cart: original, lineId: "line-a", now: now + 3 })).toEqual({
    ok: true,
    value: null,
  });
  expect(removeCartLine({ cart: added.value, lineId: "line-a", now: now + 3 })).toMatchObject({
    ok: true,
    value: { lines: [{ lineId: "line-b" }] },
  });
});

test("[CUS-09] rejects duplicate line ids, missing lines and invalid quantity edits", () => {
  const original = cart();
  expect(addCartLine({ cart: original, merchant, line: configured(), now })).toMatchObject({
    ok: false,
    error: { code: "duplicate_line" },
  });
  expect(setCartQuantity({ cart: original, lineId: "missing", quantity: 1, now })).toMatchObject({
    ok: false,
    error: { code: "line_not_found" },
  });
  expect(removeCartLine({ cart: original, lineId: "missing", now })).toMatchObject({
    ok: false,
    error: { code: "line_not_found" },
  });
  expect(setCartQuantity({ cart: original, lineId: "line-a", quantity: 0, now })).toMatchObject({
    ok: false,
    error: { code: "invalid_quantity" },
  });
});

test("[CUS-09] safely rejects subtotal overflow and a quantity edit that overflows", () => {
  const large = configured({
    item: { ...item, priceDzd: Number.MAX_SAFE_INTEGER },
    optionGroups: [],
    selections: [],
    quantity: 1,
  });
  const first = addCartLine({ cart: null, merchant, line: large, now });
  if (!first.ok) throw new Error(first.error.code);
  expect(
    addCartLine({ cart: first.value, merchant, line: configured({ lineId: "line-b" }), now }),
  ).toMatchObject({ ok: false, error: { code: "invalid_money" } });
  expect(setCartQuantity({ cart: first.value, lineId: "line-a", quantity: 2, now })).toMatchObject({
    ok: false,
    error: { code: "invalid_money" },
  });
});

test("[CUS-09] persists for seven days, expires at the boundary, renews after editing", () => {
  const original = cart();
  expect(
    readPersistedCart({ value: JSON.parse(JSON.stringify(original)), now: now + week - 1 }),
  ).toEqual({ ok: true, value: original });
  expect(readPersistedCart({ value: original, now: now + week })).toEqual({
    ok: true,
    value: null,
  });
  expect(
    setCartQuantity({ cart: original, lineId: "line-a", quantity: 1, now: now + 1 }),
  ).toMatchObject({ ok: true, value: { expiresAt: now + week + 1 } });
  expect(
    addCartLine({
      cart: original,
      merchant: { ...merchant, merchantId: "new" },
      line: configured(),
      now: now + week,
    }),
  ).toMatchObject({ ok: true, value: { merchant: { merchantId: "new" } } });
});

test.each([
  null,
  "",
  {},
  { version: 2 },
  { ...cart(), expiresAt: Infinity },
  { ...cart(), lines: [] },
  { ...cart(), lines: [{ ...configured(), quantity: 21 }] },
  { ...cart(), lines: [{ ...configured(), unitPriceDzd: 0.5 }] },
  { ...cart(), lines: [{ ...configured(), note: "x".repeat(141) }] },
  { ...cart(), lines: [configured(), configured()] },
  { ...cart(), merchant: { ...merchant, minimumDzd: -1 } },
  { ...cart(), lines: [{ ...configured(), options: [{ optionId: "bad" }] }] },
])("[CUS-09] rejects malformed persisted data safely %j", (value) => {
  expect(readPersistedCart({ value, now })).toMatchObject({
    ok: false,
    error: { code: "invalid_cart" },
  });
});
