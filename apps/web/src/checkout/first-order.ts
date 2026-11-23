import { useEffect, useSyncExternalStore } from "react";

/** A plain "has ordered before" flag: no order data, no identifiers (DESIGN §0, D-037). */
const storageKey = "awid:has-ordered";
let snapshot: boolean | undefined;

type FlagStorage = Pick<Storage, "getItem" | "setItem">;

export function isFirstOrder(storage: Pick<FlagStorage, "getItem">) {
  try {
    return storage.getItem(storageKey) === null;
  } catch {
    return false;
  }
}

export function rememberOrdered(storage: Pick<FlagStorage, "setItem">) {
  try {
    storage.setItem(storageKey, "1");
  } catch {
    // Without storage, every order is celebrated the same way.
  }
}

function subscribe() {
  return () => undefined;
}

function readOnce() {
  try {
    snapshot ??= isFirstOrder(window.localStorage);
  } catch {
    snapshot = false;
  }
  return snapshot;
}

/** True on the diner's first confirmed order on this device; read once, then remembered. */
export function useIsFirstOrder() {
  const isFirst = useSyncExternalStore(subscribe, readOnce, () => false);
  useEffect(() => {
    try {
      rememberOrdered(window.localStorage);
    } catch {
      // Storage access itself can throw in private windows.
    }
  }, []);
  return isFirst;
}
