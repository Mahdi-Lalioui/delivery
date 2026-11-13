"use client";

import { buzz, chime, statusArrived } from "../feel/feel";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyTrackingPosition,
  cancelOrder,
  isTerminal,
  loadTracking,
  parseTrackingPosition,
  type TrackingPosition,
  type CancelResult,
  type TrackingLoad,
} from "./tracking-http";

const pollMs = 5000;
const reconciliationMs = 15_000;

export type TrackingState = {
  view: TrackingLoad | { kind: "loading" };
  cancel: { kind: "idle" | "cancelling" } | CancelResult;
  retry: () => void;
  cancelOrder: (reason: string) => void;
};

/** The restaurant said yes: a short buzz and, if the diner chose it, a soft chime. */
function useAcceptedMoment(status: string | undefined) {
  const previous = useRef(status);
  useEffect(() => {
    if (status !== undefined && statusArrived(previous.current, status, "accepted")) {
      buzz("accepted");
      chime();
    }
    previous.current = status;
  }, [status]);
}

export function useTracking(orderId: string): TrackingState {
  const [view, setView] = useState<TrackingState["view"]>({ kind: "loading" });
  const [cancel, setCancel] = useState<TrackingState["cancel"]>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  const cancelKey = useRef(crypto.randomUUID());

  useEffect(() => subscribeToTracking(orderId, setView), [orderId, attempt]);

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

  useAcceptedMoment(view.kind === "ready" ? view.tracking.order.status : undefined);
  return { view, cancel, retry, cancelOrder: requestCancel };
}

function subscribeToTracking(orderId: string, setView: (view: TrackingState["view"]) => void) {
  const controller = new AbortController();
  const { signal } = controller;
  let timer: number | undefined;
  let current: TrackingLoad | undefined;
  let stream: EventSource | undefined;
  let position: TrackingPosition | undefined;
  let streaming = false;
  let refreshing = false;
  let refreshQueued = false;
  let finished = false;

  function applyPosition(view: TrackingLoad, frame: TrackingPosition): TrackingLoad {
    if (view.kind !== "ready") return view;
    return { kind: "ready", tracking: applyTrackingPosition(view.tracking, frame) };
  }

  function onPosition(event: MessageEvent<unknown>) {
    const frame = parseTrackingPosition(event.data);
    if (!frame || frame.orderId !== orderId) return;
    if (position && Date.parse(position.capturedAt) >= Date.parse(frame.capturedAt)) return;
    position = frame;
    if (!current) return;
    current = applyPosition(current, frame);
    setView(current);
  }

  function connect(version: number) {
    if (stream || !("EventSource" in window)) return;
    const query = new URLSearchParams({ topic: "order", orderId, after: String(version) });
    stream = new EventSource("/v1/realtime?" + query.toString());
    stream.onopen = () => {
      streaming = true;
    };
    stream.onerror = () => {
      const wasStreaming = streaming;
      streaming = false;
      if (wasStreaming) schedule(0);
    };
    stream.addEventListener("order", () => {
      schedule(0);
    });
    stream.addEventListener("position", onPosition);
  }

  function schedule(delay: number) {
    if (finished || signal.aborted) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (document.visibilityState === "visible") void refresh();
      else schedule(pollMs);
    }, delay);
  }

  function publish(result: TrackingLoad) {
    if (result.kind === "ready") {
      current = position ? applyPosition(result, position) : result;
      setView(current);
      if (!isTerminal(result.tracking.order.status)) connect(result.tracking.order.version);
      else finished = true;
      return;
    }
    if (result.kind !== "error" || current?.kind !== "ready") {
      current = result;
      setView(result);
    }
    finished = result.kind !== "error";
  }

  function stopped() {
    return finished || signal.aborted;
  }

  async function refresh() {
    if (stopped()) return;
    if (refreshing) {
      refreshQueued = true;
      return;
    }
    refreshing = true;
    const result = await loadTracking(orderId, signal);
    refreshing = false;
    if (signal.aborted) return;
    publish(result);
    if (finished) stream?.close();
    const delay = refreshQueued ? 0 : streaming ? reconciliationMs : pollMs;
    refreshQueued = false;
    schedule(delay);
  }

  function wake() {
    if (document.visibilityState === "visible") schedule(0);
  }
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", wake);
  void refresh();
  return () => {
    controller.abort();
    stream?.close();
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("online", wake);
  };
}
