"use client";

import { useEffect, useState } from "react";
import {
  loadDashboardToday,
  loadMerchantAnalytics,
  rangeEndingToday,
  type AnalyticsLoad,
  type DashboardLoad,
} from "./analytics-http";

export type RangeDays = "7" | "30" | "90";
export type MerchantAnalyticsState = {
  view: AnalyticsLoad | { kind: "loading" };
  range: RangeDays;
  setRange: (range: RangeDays) => void;
  retry: () => void;
};

export function useMerchantAnalytics(merchantId: string): MerchantAnalyticsState {
  const [view, setView] = useState<MerchantAnalyticsState["view"]>({ kind: "loading" });
  const [range, setRange] = useState<RangeDays>("30");
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setView({ kind: "loading" });
    const { from, to } = rangeEndingToday(Number(range), Date.now());
    void loadMerchantAnalytics({ merchantId, from, to, signal: controller.signal }).then(
      (result) => {
        if (!controller.signal.aborted) setView(result);
      },
    );
    return () => {
      controller.abort();
    };
  }, [merchantId, range, generation]);
  return {
    view,
    range,
    setRange,
    retry: () => {
      setGeneration((value) => value + 1);
    },
  };
}

export function useDashboardToday(): {
  view: DashboardLoad | { kind: "loading" };
  retry: () => void;
} {
  const [view, setView] = useState<DashboardLoad | { kind: "loading" }>({ kind: "loading" });
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void loadDashboardToday(controller.signal).then((result) => {
      if (!controller.signal.aborted) setView(result);
    });
    return () => {
      controller.abort();
    };
  }, [generation]);
  return {
    view,
    retry: () => {
      setGeneration((value) => value + 1);
    },
  };
}
