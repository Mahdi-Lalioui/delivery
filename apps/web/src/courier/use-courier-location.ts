"use client";

import { useEffect, useState } from "react";
import { sendCourierPositions } from "./courier-http";
import { courierGpsFix, isNewCourierPosition, type Position } from "./courier-position";

export type LocationState = "off" | "acquiring" | "sending" | "buffered" | "unavailable";

function watchDelivery(orderId: string, report: (state: LocationState) => void) {
  const controller = new AbortController();
  const queue: Position[] = [];
  let watcher: number | undefined;
  let lock: WakeLockSentinel | undefined;
  let lastFix: Position | undefined;
  let sending = false;

  function stopWatch() {
    if (watcher !== undefined) {
      navigator.geolocation.clearWatch(watcher);
      watcher = undefined;
    }
  }

  const stopped = () => controller.signal.aborted;

  async function sendBatch(batch: Position[]) {
    sending = true;
    const result = await sendCourierPositions(orderId, batch, controller.signal);
    sending = false;
    if (stopped()) return;
    if (result.kind === "ready") {
      const sentThrough = batch.at(-1)?.capturedAt ?? "";
      while (queue[0] && queue[0].capturedAt <= sentThrough) queue.shift();
      report("sending");
    } else if (result.kind === "retry") {
      report("buffered");
    } else {
      report("unavailable");
      controller.abort();
      stopWatch();
    }
  }

  function flush() {
    if (stopped() || sending || !queue.length || document.visibilityState !== "visible") return;
    if (!navigator.onLine) {
      report("buffered");
      return;
    }
    const freshSince = Date.now() - 120_000;
    while (queue[0] && Date.parse(queue[0].capturedAt) < freshSince) queue.shift();
    if (queue.length) void sendBatch(queue.slice(0, 50));
  }

  function capture(fix: GeolocationPosition) {
    const point = courierGpsFix(fix.coords, fix.timestamp);
    if (
      !isNewCourierPosition(point, lastFix) ||
      controller.signal.aborted ||
      document.visibilityState !== "visible"
    )
      return;
    lastFix = point;
    queue.push(point);
    if (queue.length > 50) queue.shift();
    if (!navigator.onLine) report("buffered");
  }

  function syncWatch() {
    if (document.visibilityState !== "visible" || controller.signal.aborted) {
      stopWatch();
      return;
    }
    if (watcher === undefined) {
      watcher = navigator.geolocation.watchPosition(
        capture,
        () => {
          report("unavailable");
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
      );
    }
    if ("wakeLock" in navigator && (!lock || lock.released)) {
      void navigator.wakeLock
        .request("screen")
        .then((sentinel) => {
          if (controller.signal.aborted) return sentinel.release();
          lock = sentinel;
        })
        .catch(() => undefined);
    }
  }

  syncWatch();
  const timer = setInterval(flush, 5_000);
  document.addEventListener("visibilitychange", syncWatch);
  window.addEventListener("online", flush);
  return () => {
    controller.abort();
    stopWatch();
    clearInterval(timer);
    document.removeEventListener("visibilitychange", syncWatch);
    window.removeEventListener("online", flush);
    void lock?.release().catch(() => undefined);
  };
}

export function useCourierLocation(orderId: string) {
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<LocationState>("off");
  useEffect(() => (enabled ? watchDelivery(orderId, setState) : undefined), [enabled, orderId]);

  function setSharing(next: boolean) {
    if (next && !("geolocation" in navigator)) {
      setState("unavailable");
      return;
    }
    setState(next ? "acquiring" : "off");
    setEnabled(next);
  }
  return { state, enabled, setSharing };
}
