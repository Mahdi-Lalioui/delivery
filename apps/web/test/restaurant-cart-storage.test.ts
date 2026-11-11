import { addCartLine, configureCartLine, type Cart } from "@zaafran/domain/cart";
import { expect, test } from "vitest";
import { cartStorageKey, readBrowserCart, saveBrowserCart } from "../src/restaurant/cart-storage";

function savedCart(): Cart {
  const line = configureCartLine({
    lineId: "line",
    item: { itemId: "item", names: { fr: "Plat" }, priceDzd: 500, isAvailable: true },
    optionGroups: [],
    selections: [],
    quantity: 1,
    note: "",
  });
  if (!line.ok) throw new Error(line.error.code);
  const cart = addCartLine({
    cart: null,
    merchant: { merchantId: "merchant", name: "Restaurant", minimumDzd: 0 },
    line: line.value,
    now: 1_000,
  });
  if (!cart.ok) throw new Error(cart.error.code);
  return cart.value;
}

function storage(initial?: string) {
  const values = new Map(initial === undefined ? [] : [[cartStorageKey, initial]]);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

test("[CUS-09:web] restores across reloads, expires after seven days and clears removed carts", () => {
  const local = storage();
  const cart = savedCart();
  expect(saveBrowserCart(local, cart)).toBe(true);
  expect(readBrowserCart(local, 2_000)).toEqual(cart);
  expect(readBrowserCart(local, 604_801_000)).toBeNull();
  expect(local.getItem(cartStorageKey)).toBeNull();
  saveBrowserCart(local, cart);
  expect(saveBrowserCart(local, null)).toBe(true);
  expect(readBrowserCart(local, 2_000)).toBeNull();
});

test.each([
  "{broken",
  "null",
  JSON.stringify({ version: 99 }),
  JSON.stringify({ ...savedCart(), lines: [] }),
])("[CUS-09:web] discards malformed local carts safely %s", (value) => {
  const local = storage(value);
  expect(readBrowserCart(local, 2_000)).toBeNull();
  expect(local.getItem(cartStorageKey)).toBeNull();
});

test("[CUS-09:web] remains usable when browser storage is blocked or full", () => {
  const unavailable = {
    getItem: () => {
      throw new Error("Blocked");
    },
    setItem: () => {
      throw new Error("Full");
    },
    removeItem: () => {
      throw new Error("Blocked");
    },
  };
  expect(readBrowserCart(unavailable, 2_000)).toBeNull();
  expect(saveBrowserCart(unavailable, savedCart())).toBe(false);
  expect(saveBrowserCart(unavailable, null)).toBe(false);
});
