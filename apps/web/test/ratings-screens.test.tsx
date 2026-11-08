import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { MerchantReviewsView } from "../src/retention/merchant-reviews";
import { OrderRatingView } from "../src/retention/order-rating";
import type { MerchantReviewsState } from "../src/retention/use-merchant-reviews";
import type { OrderRatingState } from "../src/retention/use-order-rating";
import { ratingMockIds as ids, ratingsMockState } from "./mocks/ratings-handlers";

type Locale = "ar" | "fr" | "en";

function wrap(node: ReactNode, locale: Locale) {
  const { retentionRatings } = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={{ retentionRatings }}
      timeZone="Africa/Algiers"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

function rating(overrides: Partial<OrderRatingState>, isDelivery: boolean, locale: Locale = "fr") {
  const state: OrderRatingState = {
    view: { kind: "loading" },
    outcome: undefined,
    isSaving: false,
    save: vi.fn(),
    ...overrides,
  };
  return wrap(<OrderRatingView state={state} isDelivery={isDelivery} />, locale);
}

const future = new Date(Date.now() + 3_600_000).toISOString();
const past = new Date(Date.now() - 3_600_000).toISOString();
const saved = {
  ratingId: ids.ratingId,
  orderId: ids.orderId,
  foodStars: 4,
  deliveryStars: 5,
  comment: "Bon",
  createdAt: past,
  editableUntil: future,
  reply: { body: "Merci beaucoup", createdAt: past },
};

test("[CUS-22] asks for food and delivery stars on delivery orders, food only on pickup", () => {
  const delivery = rating({ view: { kind: "ready", rating: null } }, true);
  expect(delivery.match(/name="foodStars"/g)).toHaveLength(5);
  expect(delivery.match(/name="deliveryStars"/g)).toHaveLength(5);
  expect(delivery).toContain('maxLength="500"');
  expect(rating({ view: { kind: "ready", rating: null } }, false)).not.toContain(
    'name="deliveryStars"',
  );
});

test("[CUS-22] shows the restaurant reply and locks the form after 24 h", () => {
  const { retentionRatings } = getMessages("ar");
  const editable = rating({ view: { kind: "ready", rating: saved } }, true, "ar");
  expect(editable).toContain("Merci beaucoup");
  expect(editable).toContain(retentionRatings.update);
  const locked = rating(
    { view: { kind: "ready", rating: { ...saved, editableUntil: past } } },
    true,
    "ar",
  );
  expect(locked).toContain(retentionRatings.closed);
  expect(locked).not.toContain('type="submit"');
});

test("[CUS-22] reports validation errors next to the field and shows a skeleton while loading", () => {
  const { retentionRatings } = getMessages("en");
  const html = rating(
    { view: { kind: "ready", rating: null }, outcome: { kind: "invalid", field: "deliveryStars" } },
    true,
    "en",
  );
  expect(html).toContain(retentionRatings.deliveryStarsError);
  expect(rating({}, true, "en")).toContain('class="ui-skeleton"');
});

function reviews(overrides: Partial<MerchantReviewsState>, locale: Locale = "fr") {
  const state: MerchantReviewsState = {
    view: { kind: "loading" },
    stars: undefined,
    notice: undefined,
    isSaving: false,
    isPaging: false,
    filter: vi.fn(),
    loadMore: vi.fn(),
    reply: vi.fn(),
    report: vi.fn(),
    ...overrides,
  };
  return wrap(<MerchantReviewsView state={state} />, locale);
}

test("[MER-20] lists review cards with star rows, filter chips, reply and a quiet report action", () => {
  const { reviews: rows } = ratingsMockState();
  const html = reviews({ view: { kind: "ready", reviews: rows, nextCursor: "c" } });
  const { retentionRatings } = getMessages("fr");
  expect(html.match(/class="ui-chip"/g)).toHaveLength(6);
  expect(html).toContain("Très bon couscous");
  expect(html).toContain('class="star-row"');
  expect(html).toContain(retentionRatings.noComment);
  // The first review has no reply yet; the second's reply window has passed.
  expect(html.split(retentionRatings.reply)).toHaveLength(2);
  expect(html.match(/ui-button-danger-ghost/g)).toHaveLength(2);
  expect(html).toContain(retentionRatings.loadMore);
});

test("[MER-20] has empty, loading and not-found states", () => {
  const { retentionRatings } = getMessages("en");
  expect(reviews({ view: { kind: "ready", reviews: [], nextCursor: null } }, "en")).toContain(
    retentionRatings.noReviewsBody,
  );
  expect(reviews({}, "en")).toContain('class="ui-skeleton"');
  expect(reviews({ view: { kind: "not-found" } }, "en")).toContain(retentionRatings.notFound);
});
