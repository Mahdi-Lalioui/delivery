import { addCartLine, type Cart, type CartLine } from "@zaafran/domain/cart";
import { prepareItemLine } from "../restaurant/item-draft";
import type { RestaurantItem } from "../restaurant/restaurant-types";
import type { Reorder } from "./orders-http";

type DraftItem = Reorder["draft"]["items"][number];
type ItemRead = { kind: "ready"; value: RestaurantItem } | { kind: "stale" } | { kind: "error" };

export type ReorderCartResult =
  | { kind: "ready"; cart: Cart; skipped: number }
  | { kind: "merchant-change" }
  | { kind: "empty" }
  | { kind: "error" };

/** The draft's flat option list, split back into the item's current option groups. */
function selectionsFor(detail: RestaurantItem, optionIds: readonly string[]) {
  return detail.optionGroups.map((group) => ({
    optionGroupId: group.optionGroupId,
    optionIds: group.options
      .filter((option) => optionIds.includes(option.optionId))
      .map((option) => option.optionId),
  }));
}

async function lineFor(
  item: DraftItem,
  readItem: (itemId: string) => Promise<ItemRead>,
  newLineId: () => string,
): Promise<CartLine | null> {
  const read = await readItem(item.itemId);
  if (read.kind !== "ready") return null;
  const draft = {
    quantity: item.quantity,
    note: "",
    selections: selectionsFor(read.value, item.optionIds),
  };
  const line = prepareItemLine(read.value, draft, newLineId());
  return line.ok ? line.value : null;
}

/**
 * CUS-21: puts a reorder draft into the browser cart, re-checked against the live menu.
 * Dishes or choices that no longer pass the menu's rules are skipped and counted; another
 * restaurant's cart is only replaced when `replace` is set (the diner confirmed it).
 */
export async function reorderIntoCart(input: {
  draft: Reorder["draft"];
  merchantName: string;
  cart: Cart | null;
  replace: boolean;
  now: number;
  newLineId: () => string;
  readItem: (itemId: string) => Promise<ItemRead>;
}): Promise<ReorderCartResult> {
  const { draft, cart, now } = input;
  const isOtherRestaurant = holdsOtherRestaurant(cart, draft.merchantId, now);
  if (isOtherRestaurant && !input.replace) return { kind: "merchant-change" };
  const lines = await Promise.all(
    draft.items.map((item) => lineFor(item, input.readItem, input.newLineId)),
  );
  const merchant = { merchantId: draft.merchantId, name: input.merchantName, minimumDzd: 0 };
  const start = isOtherRestaurant ? null : cart;
  const next = fill(start, lines, (line, current) =>
    addCartLine({ cart: current, merchant, line, now, confirmMerchantChange: true }),
  );
  if (next === "error") return { kind: "error" };
  const skipped = lines.filter((line) => line === null).length;
  return next === null || next === start
    ? { kind: "empty" }
    : { kind: "ready", cart: next, skipped };
}

function holdsOtherRestaurant(cart: Cart | null, merchantId: string, now: number): boolean {
  return cart !== null && cart.expiresAt > now && cart.merchant.merchantId !== merchantId;
}

function fill(
  start: Cart | null,
  lines: readonly (CartLine | null)[],
  add: (line: CartLine, cart: Cart | null) => ReturnType<typeof addCartLine>,
): Cart | null | "error" {
  let cart = start;
  for (const line of lines) {
    if (line === null) continue;
    const added = add(line, cart);
    if (!added.ok) return "error";
    cart = added.value;
  }
  return cart;
}
