import { readPersistedCart, type Cart } from "@zaafran/domain/cart";

export const cartStorageKey = "zaafran.customer-cart.v1";
const expiredNoticeKey = "zaafran.customer-cart-expired.v1";
type CartStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** A cart that was valid but ran past its seven days: remember whose it was, once. */
function noteExpiry(storage: CartStorage, value: unknown) {
  const expiresAt: unknown =
    typeof value === "object" && value !== null ? Reflect.get(value, "expiresAt") : undefined;
  if (typeof expiresAt !== "number") return;
  const before = readPersistedCart({ value, now: expiresAt - 1 });
  if (before.ok && before.value) storage.setItem(expiredNoticeKey, before.value.merchant.name);
}

/** The restaurant whose cart just expired, shown once so checkout can explain the empty basket. */
export function takeExpiredCartNotice(storage: CartStorage): string | null {
  try {
    const name = storage.getItem(expiredNoticeKey);
    storage.removeItem(expiredNoticeKey);
    return name;
  } catch {
    return null;
  }
}

export function readBrowserCart(storage: CartStorage, now: number): Cart | null {
  try {
    const text = storage.getItem(cartStorageKey);
    if (text === null) return null;
    const value: unknown = JSON.parse(text);
    const parsed = readPersistedCart({ value, now });
    if (parsed.ok && parsed.value !== null) return parsed.value;
    if (parsed.ok) noteExpiry(storage, value);
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
