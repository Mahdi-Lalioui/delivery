import { readPersistedCart, type Cart } from "@zaafran/domain/cart";

export const cartStorageKey = "zaafran.customer-cart.v1";
type CartStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readBrowserCart(
  storage: Pick<CartStorage, "getItem" | "removeItem">,
  now: number,
): Cart | null {
  try {
    const text = storage.getItem(cartStorageKey);
    if (text === null) return null;
    const value: unknown = JSON.parse(text);
    const parsed = readPersistedCart({ value, now });
    if (parsed.ok && parsed.value !== null) return parsed.value;
    storage.removeItem(cartStorageKey);
  } catch {
    try {
      storage.removeItem(cartStorageKey);
    } catch {
      /* Storage may be disabled. The in-memory cart still works. */
    }
  }
  return null;
}

export function saveBrowserCart(
  storage: Pick<CartStorage, "setItem" | "removeItem">,
  cart: Cart | null,
): boolean {
  try {
    if (cart === null) storage.removeItem(cartStorageKey);
    else storage.setItem(cartStorageKey, JSON.stringify(cart));
    return true;
  } catch {
    return false;
  }
}
