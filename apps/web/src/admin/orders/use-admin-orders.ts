"use client";

import { useEffect, useRef, useState } from "react";
import type { MerchantRead } from "../../merchant/merchant-http";
import { searchAdminOrders, type AdminOrderPage, type OrderQuery } from "./orders-http";

type View = MerchantRead<AdminOrderPage> | { kind: "loading" };
const refreshMs = 5_000;

export function useAdminOrders(query: OrderQuery) {
  const [loaded, setLoaded] = useState<{ query: OrderQuery; view: View; isOffline?: boolean }>();
  const [generation, setGeneration] = useState(0);
  const session = useRef<string>(undefined);
  const view: View = loaded?.query === query ? loaded.view : { kind: "loading" };

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let fetching = false;

    async function load() {
      if (fetching || document.visibilityState !== "visible") return;
      fetching = true;
      const result = await searchAdminOrders(query, controller.signal);
      fetching = false;
      if (controller.signal.aborted) return;
      if (result.kind === "ready" && session.current && result.data.sessionId !== session.current) {
        setLoaded({ query, view: { kind: "unauthenticated" } });
        return;
      }
      if (result.kind === "ready") session.current = result.data.sessionId;
      setLoaded((current) => {
        if (result.kind === "error" && current?.query === query && current.view.kind === "ready")
          return { ...current, isOffline: true };
        return { query, view: result };
      });
      if (result.kind !== "unauthenticated" && result.kind !== "forbidden")
        timer = setTimeout(() => void load(), refreshMs);
    }

    function onVisibility() {
      clearTimeout(timer);
      void load();
    }
    document.addEventListener("visibilitychange", onVisibility);
    void load();

    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [query, generation]);

  function refresh() {
    setGeneration((value) => value + 1);
  }

  return { view, refresh, isOffline: loaded?.query === query && loaded.isOffline === true };
}
