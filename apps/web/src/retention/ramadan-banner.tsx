"use client";

import { useEffect, useState } from "react";
import { IftarCountdown } from "./iftar-countdown";
import { loadRamadanToday, type RamadanToday } from "./scheduling";

/**
 * HRS-03 / DESIGN §11 home: the Iftar banner in season. Lane A's customer home mounts it with the
 * customer's commune; it renders nothing outside Ramadan or when the lookup fails.
 */
export function RamadanBanner({ communeId }: { communeId: string }) {
  const [today, setToday] = useState<RamadanToday>();
  useEffect(() => {
    const controller = new AbortController();
    void loadRamadanToday(communeId, controller.signal).then((result) => {
      if (!controller.signal.aborted) setToday(result);
    });
    return () => {
      controller.abort();
    };
  }, [communeId]);
  return today?.kind === "ramadan" ? <IftarCountdown maghribAt={today.maghribAt} /> : null;
}
