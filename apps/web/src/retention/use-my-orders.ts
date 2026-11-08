"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadFavourites,
  loadOrderHistory,
  loadReceipt,
  reorder,
  setFavourite,
  type Favourite,
  type HistoryPage,
  type OrderSummary,
  type Receipt,
  type Reorder,
} from "./orders-http";

type Load<T> = T | { kind: "loading" } | { kind: "sign-in" | "not-found" | "error" };
export type MyOrdersState = {
  history: Load<Extract<HistoryPage, { kind: "ready" }>>;
  favourites: Load<{ kind: "ready"; restaurants: Favourite[] }>;
  receipt: { orderId: string; result: Load<{ kind: "ready"; receipt: Receipt }> } | undefined;
  reorderResult:
    { order: OrderSummary; result: Load<{ kind: "ready"; reorder: Reorder }> } | undefined;
  isPaging: boolean;
  showReceipt: (orderId: string | undefined) => void;
  orderAgain: (order: OrderSummary) => Promise<void>;
  toggleFavourite: (merchantId: string, isFavourite: boolean) => Promise<boolean>;
  loadMore: () => Promise<void>;
  refresh: () => void;
};

export function useMyOrders(): MyOrdersState {
  const [history, setHistory] = useState<MyOrdersState["history"]>({ kind: "loading" });
  const [favourites, setFavourites] = useState<MyOrdersState["favourites"]>({ kind: "loading" });
  const [receipt, setReceipt] = useState<MyOrdersState["receipt"]>();
  const [reorderResult, setReorderResult] = useState<MyOrdersState["reorderResult"]>();
  const [isPaging, setIsPaging] = useState(false);
  const [generation, setGeneration] = useState(0);
  const reorderKeys = useRef(new Map<string, string>());

  useEffect(() => {
    const controller = new AbortController();
    void loadOrderHistory({ signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setHistory(result);
    });
    void loadFavourites(controller.signal).then((result) => {
      if (!controller.signal.aborted) setFavourites(result);
    });
    return () => {
      controller.abort();
    };
  }, [generation]);

  const refresh = useCallback(() => {
    setGeneration((value) => value + 1);
  }, []);

  const showReceipt = useCallback((orderId: string | undefined) => {
    if (orderId === undefined) {
      setReceipt(undefined);
      return;
    }
    setReceipt({ orderId, result: { kind: "loading" } });
    void loadReceipt(orderId).then((result) => {
      setReceipt((current) => (current?.orderId === orderId ? { orderId, result } : current));
    });
  }, []);

  const orderAgain = useCallback(async (order: OrderSummary) => {
    const key = reorderKeys.current.get(order.orderId) ?? crypto.randomUUID();
    reorderKeys.current.set(order.orderId, key);
    setReorderResult({ order, result: { kind: "loading" } });
    const result = await reorder({ orderId: order.orderId, merchantId: order.merchantId, key });
    setReorderResult({ order, result });
  }, []);

  const toggleFavourite = useCallback(
    async (merchantId: string, isFavourite: boolean) => {
      const result = await setFavourite(merchantId, isFavourite);
      if (result.kind === "saved") refresh();
      return result.kind === "saved";
    },
    [refresh],
  );

  const loadMore = useCallback(async () => {
    if (history.kind !== "ready" || history.nextCursor === null) return;
    setIsPaging(true);
    const page = await loadOrderHistory({ cursor: history.nextCursor });
    setIsPaging(false);
    if (page.kind === "ready") setHistory({ ...page, orders: [...history.orders, ...page.orders] });
  }, [history]);

  return {
    history,
    favourites,
    receipt,
    reorderResult,
    isPaging,
    showReceipt,
    orderAgain,
    toggleFavourite,
    loadMore,
    refresh,
  };
}
