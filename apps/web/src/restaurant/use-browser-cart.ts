import { type Cart } from "@zaafran/domain/cart";
import { useEffect, useState } from "react";
import { cartStorageKey, readBrowserCart, saveBrowserCart } from "./cart-storage";

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

export function useBrowserCart() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [storageFailed, setStorageFailed] = useState(false);
  useEffect(() => {
    function restore() {
      setCart(currentBrowserCart());
    }
    restore();
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
    setCart(next);
    const storage = browserStorage();
    setStorageFailed(storage === null || !saveBrowserCart(storage, next));
  }
  return { cart, save, storageFailed };
}
