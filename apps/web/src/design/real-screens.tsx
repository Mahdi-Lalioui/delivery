"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { CheckoutSample } from "../admin/gallery/checkout-sample";
import { OrdersSample, RatingSample } from "../admin/gallery/lane-b-gallery";
import { TrackingSample } from "../admin/gallery/tracking-sample";
import type { RealScreen as Screen } from "./real-screen-list";

// Design build only: each customer screen as a full page in a realistic state, for the
// design-loop screenshots (the preview API is read-only, so these use fixtures).

export function RealScreen({ screen, locale }: { screen: Screen; locale: Locale }) {
  switch (screen) {
    case "checkout":
      return <CheckoutSample mode="ready" locale={locale} isBare />;
    case "checkout-payment":
      return <CheckoutSample mode="ready" locale={locale} initialView="3" isBare />;
    case "confirmed":
      return <CheckoutSample mode="ready" locale={locale} initialView="confirmed" isBare />;
    case "tracking":
      return <TrackingSample mode="ready" locale={locale} isBare />;
    case "tracking-waiting":
      return <TrackingSample mode="ready" locale={locale} initialStory="waiting" isBare />;
    case "tracking-pickup":
      return <TrackingSample mode="ready" locale={locale} initialStory="pickup" isBare />;
    case "rating":
      return <RatingSample mode="ready" />;
    case "orders":
      return <OrdersSample mode="ready" locale={locale} />;
  }
}
