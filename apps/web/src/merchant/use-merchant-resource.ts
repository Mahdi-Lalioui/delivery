"use client";

import { useEffect, useState } from "react";
import type { MerchantRead } from "./merchant-http";

type MerchantView<Data> = MerchantRead<Data> | { kind: "loading" };

export function useMerchantResource<Data>(
  read: (signal: AbortSignal) => Promise<MerchantRead<Data>>,
) {
  const [view, setView] = useState<MerchantView<Data>>({ kind: "loading" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void read(controller.signal).then((result) => {
      if (!controller.signal.aborted) setView(result);
    });
    return () => {
      controller.abort();
    };
  }, [read, version]);

  function retry() {
    setView({ kind: "loading" });
    setVersion((current) => current + 1);
  }

  return { view, retry };
}
