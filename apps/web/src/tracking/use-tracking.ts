"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelOrder,
  isTerminal,
  loadTracking,
  type CancelResult,
  type TrackingLoad,
} from "./tracking-http";

const pollMs = 5000;

export type TrackingState = {
  view: TrackingLoad | { kind: "loading" };
  cancel: { kind: "idle" | "cancelling" } | CancelResult;
  retry: () => void;
  cancelOrder: (reason: string) => void;
};

/** Polls tracking every 5 s while the tab is visible and the order can still change. */
export function useTracking(orderId: string): TrackingState {
  const [view, setView] = useState<TrackingState["view"]>({ kind: "loading" });
  const [cancel, setCancel] = useState<TrackingState["cancel"]>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  const cancelKey = useRef(crypto.randomUUID());

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    async function poll() {
      const result = await loadTracking(orderId, controller.signal);
      if (controller.signal.aborted) return;
      setView((current) =>
        result.kind === "error" && current.kind === "ready" ? current : result,
      );
      const isDone = result.kind === "ready" && isTerminal(result.tracking.order.status);
      if (!isDone && result.kind !== "sign-in" && result.kind !== "not-found")
        timer = window.setTimeout(schedule, pollMs);
    }
    function schedule() {
      if (document.visibilityState === "visible") void poll();
      else timer = window.setTimeout(schedule, pollMs);
    }
    void poll();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [orderId, attempt]);

  const retry = useCallback(() => {
    setView({ kind: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  const requestCancel = useCallback(
    (reason: string) => {
      if (view.kind !== "ready") return;
      setCancel({ kind: "cancelling" });
      void cancelOrder({
        orderId,
        expectedVersion: view.tracking.order.version,
        reason,
        key: cancelKey.current,
      }).then((result) => {
        setCancel(result);
        setAttempt((value) => value + 1);
      });
    },
    [orderId, view],
  );

  return { view, cancel, retry, cancelOrder: requestCancel };
}
