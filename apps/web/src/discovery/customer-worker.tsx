"use client";

import { useEffect } from "react";

export function CustomerWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/pwa-worker.js").catch(() => {
        // Discovery remains usable if offline support is unavailable.
      });
    }
  }, []);
  return null;
}
