import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { TrackingView } from "../src/tracking/tracking-view";
import type { TrackingState } from "../src/tracking/use-tracking";
import { customerTrackingOutput } from "@zaafran/contracts/tracking";

const tracking = customerTrackingOutput.parse({
  fulfilment: "pickup",
  order: {
    orderId: "00000000-0000-4000-8000-000000000501",
    merchantId: "00000000-0000-4000-8000-000000000010",
    status: "ready",
    fulfilment: "pickup",
    shortCode: "ABC-DEF",
    version: 4,
    placedAt: "2026-11-11T20:00:00.000Z",
    scheduledFor: null,
    acceptanceDeadlineAt: null,
    eta: { earliestAt: "2026-11-11T20:30:00.000Z", latestAt: "2026-11-11T20:40:00.000Z" },
    totalDzd: 1700,
  },
  timeline: [{ status: "ready", at: "2026-11-11T20:25:00.000Z" }],
  restaurantPhone: null,
  shareToken: null,
  pickupPin: { latitude: 36.7538, longitude: 3.0588 },
  pickupCode: "ABC-DEF",
});

test("[CUS-18] pickup tracking gives its location and counter code a desktop side panel", () => {
  const state: TrackingState = {
    view: { kind: "ready", tracking },
    cancel: { kind: "idle" },
    retry() {},
    cancelOrder() {},
  };
  const messages = getMessages("fr");
  const html = renderToStaticMarkup(
    <NextIntlClientProvider
      locale="fr-DZ"
      timeZone="Africa/Algiers"
      messages={{ tracking: messages.tracking }}
    >
      <TrackingView state={state} locale="fr" />
    </NextIntlClientProvider>,
  );
  expect(html).toContain('class="tracking-pickup-aside"');
  expect(html).toContain("Point de retrait");
  expect(html).toContain("Code de retrait");
  expect(html).toContain("openstreetmap.org/directions");
});
