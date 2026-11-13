"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { SegmentedControl } from "@zaafran/ui";
import { useState } from "react";
import type { Tracking } from "../../tracking/tracking-http";
import { TrackingView } from "../../tracking/tracking-view";
import type { TrackingState } from "../../tracking/use-tracking";

type Mode = "ready" | "empty" | "loading" | "error";
type Story =
  | "on-the-way"
  | "waiting"
  | "pickup"
  | "delivered"
  | "rejected"
  | "expired"
  | "cancelled"
  | "delivery_failed";

const noop = () => undefined;
const order = {
  orderId: "00000000-0000-4000-8000-000000000500",
  merchantId: "00000000-0000-4000-8000-000000000030",
  shortCode: "K7P-4QX",
  version: 4,
  placedAt: "2027-02-10T18:40:00.000Z",
  scheduledFor: null,
  acceptanceDeadlineAt: null,
  eta: { earliestAt: "2027-02-10T19:15:00.000Z", latestAt: "2027-02-10T19:25:00.000Z" },
  totalDzd: 3100,
};
const at = (minute: number) => `2027-02-10T18:${String(minute).padStart(2, "0")}:00.000Z`;
const route = [
  [36.7525, 3.042],
  [36.7548, 3.0462],
  [36.7571, 3.0479],
  [36.7602, 3.0521],
  [36.7631, 3.0547],
  [36.7652, 3.0588],
].map(([latitude = 0, longitude = 0]) => ({ latitude, longitude }));

function delivery(status: Tracking["order"]["status"], minutes: number[]): Tracking {
  const statuses = [
    "pending_acceptance",
    "accepted",
    "ready",
    "out_for_delivery",
    "delivered",
  ] as const;
  return {
    fulfilment: "delivery",
    order: { ...order, fulfilment: "delivery", status },
    timeline: minutes.map((minute, index) => ({
      status: statuses[index] ?? "delivered",
      at: at(minute),
    })),
    restaurantPhone: "+213550123456",
    shareToken: null,
    destination: { latitude: 36.7652, longitude: 3.0588 },
    deliveryCode: "4821",
    courier:
      status === "out_for_delivery"
        ? {
            firstName: "Yacine",
            phone: "+213661234567",
            position: { latitude: 36.7571, longitude: 3.0479, heading: 40, capturedAt: at(58) },
          }
        : null,
    route: status === "out_for_delivery" ? route : null,
  };
}

const stories: Readonly<Record<Story, Tracking>> = {
  "on-the-way": delivery("out_for_delivery", [40, 42, 55, 57]),
  waiting: delivery("pending_acceptance", [40]),
  delivered: delivery("delivered", [40, 42, 55, 57, 59]),
  rejected: delivery("rejected", [40]),
  expired: delivery("expired", [40]),
  cancelled: delivery("cancelled", [40, 42]),
  delivery_failed: delivery("delivery_failed", [40, 42, 55, 57]),
  pickup: {
    fulfilment: "pickup",
    order: { ...order, fulfilment: "pickup", status: "ready" },
    timeline: [
      { status: "pending_acceptance", at: at(40) },
      { status: "accepted", at: at(41) },
      { status: "ready", at: at(52) },
    ],
    restaurantPhone: "+213550123456",
    shareToken: null,
    pickupPin: { latitude: 36.7525, longitude: 3.042 },
    pickupCode: "K7P-4QX",
  },
};

/** CUS-18 / CUS-19 tracking with fixtures for each story and state. */
export function TrackingSample({
  mode,
  locale,
  initialStory = "on-the-way",
  isBare = false,
}: {
  mode: Mode;
  locale: Locale;
  initialStory?: Story;
  isBare?: boolean;
}) {
  const [story, setStory] = useState<Story>(initialStory);
  const state: TrackingState = {
    view:
      mode === "ready"
        ? { kind: "ready", tracking: stories[story] }
        : mode === "empty"
          ? { kind: "not-found" }
          : { kind: mode },
    cancel: { kind: "idle" },
    retry: noop,
    cancelOrder: noop,
  };
  return (
    <div className={isBare ? undefined : "billing-layout"}>
      {!isBare && (
        <SegmentedControl
          legend="story"
          name="tracking-story"
          value={story}
          onChange={setStory}
          options={[
            { value: "on-the-way", label: "→" },
            { value: "waiting", label: "…" },
            { value: "pickup", label: "P" },
            { value: "delivered", label: "✓" },
          ]}
        />
      )}
      <TrackingView state={state} locale={locale} />
    </div>
  );
}
