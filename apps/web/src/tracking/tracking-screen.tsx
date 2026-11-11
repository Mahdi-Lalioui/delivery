"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { TrackingView } from "./tracking-view";
import { useTracking } from "./use-tracking";

export function TrackingScreen({ orderId, locale }: { orderId: string; locale: Locale }) {
  return <TrackingView state={useTracking(orderId)} locale={locale} />;
}
