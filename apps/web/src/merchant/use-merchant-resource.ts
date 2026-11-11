"use client";

import { useEffect, useState } from "react";
import type { MerchantRead } from "./merchant-http";

type MerchantView<Data> = MerchantRead<Data> | { kind: "loading" };

export function useMerchantResource<Data>(
  read: (signal: AbortSignal) => Promise<MerchantRead<Data>>,
) {
  const [loaded, setLoaded] = useState<{ read: typeof read; view: MerchantView<Data> }>();
  const view: MerchantView<Data> = loaded?.read === read ? loaded.view : { kind: "loading" };
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void read(controller.signal).then((result) => {
      if (!controller.signal.aborted) setLoaded({ read, view: result });
    });
    return () => {
      controller.abort();
    };
  }, [read, version]);

  function retry() {
    setLoaded(undefined);
    setVersion((current) => current + 1);
  }

  return { view, retry };
}
