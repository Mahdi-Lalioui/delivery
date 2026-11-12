"use client";

import { useEffect } from "react";

export function useBoardPresence(active: boolean, pending: number) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let disposed = false;
    let requesting = false;

    async function keepAwake() {
      if (document.visibilityState !== "visible" || requesting || lock?.released === false) return;
      requesting = true;
      try {
        const granted = await navigator.wakeLock.request("screen");
        if (disposed) await granted.release();
        else lock = granted;
      } catch {
        // Battery saver, browser policy and hidden tabs can refuse a wake lock.
      } finally {
        requesting = false;
      }
    }

    function onVisibilityChange() {
      void keepAwake();
    }

    onVisibilityChange();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);

  useEffect(() => {
    if (pending === 0) return;
    const title = document.title;
    document.title = `(${String(pending)}) ${title}`;
    return () => {
      document.title = title;
    };
  }, [pending]);
}
