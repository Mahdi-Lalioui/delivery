import { type Cart } from "@zaafran/domain/cart";
import { useEffect, useState } from "react";
import { buzz, cartGrew } from "../feel/feel";
import {
  cartStorageKey,
  readBrowserCart,
  saveBrowserCart,
  takeExpiredCartNotice,
} from "./cart-storage";

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function currentBrowserCart(): Cart | null {
  const storage = browserStorage();
  return storage ? readBrowserCart(storage, Date.now()) : null;
}

function itemCount(cart: Cart | null): number {
  return cart?.lines.reduce((total, line) => total + line.quantity, 0) ?? 0;
}

export function useBrowserCart() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [storageFailed, setStorageFailed] = useState(false);
  const [expiredFrom, setExpiredFrom] = useState<string | null>(null);
  useEffect(() => {
    function restore() {
      setCart(currentBrowserCart());
    }
    restore();
    const storage = browserStorage();
    if (storage) setExpiredFrom(takeExpiredCartNotice(storage));
    function sync(event: StorageEvent) {
      if (event.key === cartStorageKey || event.key === null) restore();
    }
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("storage", sync);
    };
  }, []);
  useEffect(() => {
    if (cart === null) return;
    const timer = window.setTimeout(
      () => {
        // Another tab can renew the cart before this tab receives its storage event.
        const persisted = currentBrowserCart();
        setCart((current) => (current === cart ? persisted : current));
      },
      Math.max(0, cart.expiresAt - Date.now()),
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [cart]);

  function save(next: Cart | null) {
    if (cartGrew(itemCount(cart), itemCount(next))) buzz("add");
    setCart(next);
    const storage = browserStorage();
    setStorageFailed(storage === null || !saveBrowserCart(storage, next));
  }
  return { cart, save, storageFailed, expiredFrom };
}
