"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readBoard, type Board } from "./board-http";

type View =
  | { kind: "loading" | "unauthenticated" | "forbidden" | "error" }
  | { kind: "ready"; data: Board; offline: boolean };

export function useOrderBoard(merchantId: string) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [epoch, setEpoch] = useState(0);
  const cursor = useRef<string | undefined>(undefined);
  const streaming = useRef(false);
  const refresh = useCallback(() => {
    setEpoch((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { signal } = controller;

    async function poll() {
      const result = await readBoard({ merchantId, after: cursor.current, signal });
      if (signal.aborted) return;

      if (result.kind === "ready") {
        cursor.current = result.data.cursor;
        setView({ kind: "ready", data: result.data, offline: false });
        timer = setTimeout(
          () => void poll(),
          result.data.hasMore ? 0 : streaming.current ? 15_000 : 3_000,
        );
      } else if (result.kind === "error") {
        setView((previous) =>
          previous.kind === "ready" ? { ...previous, offline: true } : result,
        );
        timer = setTimeout(() => void poll(), 5_000);
      } else {
        setView(result);
      }
    }

    void poll();
    window.addEventListener("online", refresh);
    return () => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("online", refresh);
    };
  }, [merchantId, epoch, refresh]);

  const ready = view.kind === "ready";
  useEffect(() => {
    if (!ready || !("EventSource" in window)) return;
    const query = new URLSearchParams({
      topic: "merchantOrders",
      merchantId,
      after: cursor.current ?? "0",
    });
    const source = new EventSource("/v1/realtime?" + query.toString());
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    function onOrder() {
      if (refreshTimer !== undefined) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        refresh();
      }, 100);
    }

    source.onopen = () => {
      streaming.current = true;
    };
    source.onerror = () => {
      const wasStreaming = streaming.current;
      streaming.current = false;
      if (wasStreaming) onOrder();
    };
    source.addEventListener("order", onOrder);
    return () => {
      source.close();
      clearTimeout(refreshTimer);
      streaming.current = false;
    };
  }, [merchantId, ready, refresh]);

  return { view, refresh };
}
