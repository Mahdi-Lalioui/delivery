"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { CheckoutSample, type PromoStory } from "../admin/gallery/checkout-sample";
import { OrdersSample, RatingSample } from "../admin/gallery/lane-b-gallery";
import { TrackingSample } from "../admin/gallery/tracking-sample";
import type { RealScreen as Screen } from "./real-screen-list";

// Design build only: each customer screen as a full page in a realistic state, for the
// design-loop screenshots (the preview API is read-only, so these use fixtures).

type Mode = "ready" | "empty" | "loading" | "error";
type Story = Parameters<typeof TrackingSample>[0]["initialStory"];

const checkoutStates: Partial<Record<Screen, { mode: Mode; promo?: PromoStory }>> = {
  "checkout-loading": { mode: "loading" },
  "checkout-error": { mode: "error" },
  "checkout-empty": { mode: "empty" },
  "checkout-promo": { mode: "ready", promo: "code" },
  "checkout-offer": { mode: "ready", promo: "automatic" },
  "checkout-promo-rejected": { mode: "ready", promo: "rejected" },
};
const trackingStates: Partial<Record<Screen, { mode: Mode; story?: Story }>> = {
  tracking: { mode: "ready" },
  "tracking-waiting": { mode: "ready", story: "waiting" },
  "tracking-pickup": { mode: "ready", story: "pickup" },
  "tracking-loading": { mode: "loading" },
  "tracking-error": { mode: "error" },
  "tracking-not-found": { mode: "empty" },
  "tracking-delivered": { mode: "ready", story: "delivered" },
  "tracking-rejected": { mode: "ready", story: "rejected" },
  "tracking-expired": { mode: "ready", story: "expired" },
  "tracking-cancelled": { mode: "ready", story: "cancelled" },
  "tracking-delivery-failed": { mode: "ready", story: "delivery_failed" },
};
const listStates: Partial<Record<Screen, { kind: "orders" | "rating"; mode: Mode }>> = {
  orders: { kind: "orders", mode: "ready" },
  "orders-loading": { kind: "orders", mode: "loading" },
  "orders-empty": { kind: "orders", mode: "empty" },
  "orders-error": { kind: "orders", mode: "error" },
  rating: { kind: "rating", mode: "ready" },
  "rating-loading": { kind: "rating", mode: "loading" },
  "rating-error": { kind: "rating", mode: "error" },
};

function CheckoutScreen({ screen, locale }: { screen: Screen; locale: Locale }) {
  if (screen === "checkout-payment")
    return <CheckoutSample mode="ready" locale={locale} initialView="3" isBare />;
  if (screen === "confirmed")
    return <CheckoutSample mode="ready" locale={locale} initialView="confirmed" isBare />;
  const state = checkoutStates[screen] ?? { mode: "ready" };
  const view = state.promo === undefined && state.mode !== "error" ? undefined : "3";
  return (
    <CheckoutSample
      mode={state.mode}
      locale={locale}
      isBare
      {...(view && { initialView: view })}
      {...(state.promo && { promo: state.promo })}
    />
  );
}

export function RealScreen({ screen, locale }: { screen: Screen; locale: Locale }) {
  const tracking = trackingStates[screen];
  if (tracking) {
    return (
      <TrackingSample
        mode={tracking.mode}
        locale={locale}
        isBare
        {...(tracking.story && { initialStory: tracking.story })}
      />
    );
  }
  const list = listStates[screen];
  if (list?.kind === "orders") return <OrdersSample mode={list.mode} locale={locale} />;
  if (list?.kind === "rating") return <RatingSample mode={list.mode} />;
  return <CheckoutScreen screen={screen} locale={locale} />;
}
