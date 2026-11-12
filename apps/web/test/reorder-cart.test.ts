import { addCartLine, type Cart } from "@zaafran/domain/cart";
import { expect, test } from "vitest";
import { prepareItemLine } from "../src/restaurant/item-draft";
import { reorderIntoCart } from "../src/retention/reorder-cart";
import { detail } from "./restaurant-fixture";

const now = 1_800_000_000_000;
const merchantId = "019d6abc-1234-7234-8234-123456789000";
let counter = 0;
const newLineId = () => `line-${String(++counter)}`;
const ready = () => Promise.resolve({ kind: "ready" as const, value: detail });

function draft(items: { itemId: string; quantity: number; optionIds: string[] }[]) {
  return { merchantId, restaurantSlug: "dar-el-bahdja", menuRevision: 3, items };
}

function otherCart(): Cart {
  const line = prepareItemLine(
    detail,
    { quantity: 1, note: "", selections: [{ optionGroupId: "size", optionIds: ["large"] }] },
    "other-line",
  );
  if (!line.ok) throw new Error("fixture line");
  const merchant = { merchantId: "other", name: "Other", minimumDzd: 0 };
  const cart = addCartLine({ cart: null, merchant, line: line.value, now });
  if (!cart.ok) throw new Error("fixture cart");
  return cart.value;
}

test("[CUS-21] rebuilds the order's dishes and choices in the cart from the live menu", async () => {
  const result = await reorderIntoCart({
    draft: draft([{ itemId: "item", quantity: 2, optionIds: ["large", "cheese"] }]),
    merchantName: "Dar El Bahdja",
    cart: null,
    replace: false,
    now,
    newLineId,
    readItem: ready,
  });
  expect(result).toMatchObject({
    kind: "ready",
    skipped: 0,
    cart: {
      merchant: { merchantId, name: "Dar El Bahdja" },
      lines: [
        { itemId: "item", quantity: 2, options: [{ optionId: "large" }, { optionId: "cheese" }] },
      ],
    },
  });
});

test("[CUS-21] skips dishes that are gone or whose choices no longer fit", async () => {
  const result = await reorderIntoCart({
    draft: draft([
      { itemId: "item", quantity: 1, optionIds: ["regular"] },
      { itemId: "item", quantity: 1, optionIds: [] },
      { itemId: "gone", quantity: 1, optionIds: [] },
    ]),
    merchantName: "Dar El Bahdja",
    cart: null,
    replace: false,
    now,
    newLineId,
    readItem: (itemId) =>
      itemId === "gone" ? Promise.resolve({ kind: "error" as const }) : ready(),
  });
  expect(result).toMatchObject({ kind: "ready", skipped: 2 });
  if (result.kind === "ready") expect(result.cart.lines).toHaveLength(1);
});

test("[CUS-21] asks before replacing another restaurant's cart, then replaces it", async () => {
  const input = {
    draft: draft([{ itemId: "item", quantity: 1, optionIds: ["large"] }]),
    merchantName: "Dar El Bahdja",
    cart: otherCart(),
    now,
    newLineId,
    readItem: ready,
  };
  expect(await reorderIntoCart({ ...input, replace: false })).toEqual({ kind: "merchant-change" });
  const replaced = await reorderIntoCart({ ...input, replace: true });
  expect(replaced).toMatchObject({
    kind: "ready",
    cart: { merchant: { merchantId }, lines: [{}] },
  });
});

test("[CUS-21] reports an empty reorder when nothing can be added", async () => {
  const result = await reorderIntoCart({
    draft: draft([{ itemId: "item", quantity: 1, optionIds: [] }]),
    merchantName: "Dar El Bahdja",
    cart: null,
    replace: false,
    now,
    newLineId,
    readItem: ready,
  });
  expect(result).toEqual({ kind: "empty" });
});
