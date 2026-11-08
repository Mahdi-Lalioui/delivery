import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { MerchantReviews } from "../src/retention/merchant-reviews";
import { OrderRating } from "../src/retention/order-rating";
import {
  useMerchantReviews,
  type MerchantReviewsState,
} from "../src/retention/use-merchant-reviews";
import { useOrderRating, type OrderRatingState } from "../src/retention/use-order-rating";
import { ratingMockIds as ids, ratingsMockState } from "./mocks/ratings-handlers";

vi.mock("../src/retention/use-order-rating", () => ({ useOrderRating: vi.fn() }));
vi.mock("../src/retention/use-merchant-reviews", () => ({ useMerchantReviews: vi.fn() }));

type Locale = "ar" | "fr" | "en";

function wrap(node: React.ReactNode, locale: Locale) {
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
  vi.mocked(useOrderRating).mockReturnValue({
    view: { kind: "loading" },
    outcome: undefined,
    isSaving: false,
    save: vi.fn(),
    ...overrides,
  });
  return wrap(<OrderRating orderId={ids.orderId} isDelivery={isDelivery} />, locale);
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
  expect(delivery).toContain('name="foodStars"');
  expect(delivery).toContain('name="deliveryStars"');
  expect(delivery).toContain('maxLength="500"');
  const pickup = rating({ view: { kind: "ready", rating: null } }, false);
  expect(pickup).not.toContain('name="deliveryStars"');
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

test("[CUS-22] reports validation errors per field", () => {
  const { retentionRatings } = getMessages("en");
  const html = rating(
    { view: { kind: "ready", rating: null }, outcome: { kind: "invalid", field: "deliveryStars" } },
    true,
    "en",
  );
  expect(html).toContain(retentionRatings.deliveryStarsError);
});

function reviews(overrides: Partial<MerchantReviewsState>, locale: Locale = "fr") {
  vi.mocked(useMerchantReviews).mockReturnValue({
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
  });
  return wrap(<MerchantReviews merchantId={ids.merchantId} />, locale);
}

test("[MER-20] lists reviews with a star filter, reply forms and abuse reports", () => {
  const { reviews: rows } = ratingsMockState();
  const html = reviews({ view: { kind: "ready", reviews: rows, nextCursor: "c" } });
  const { retentionRatings } = getMessages("fr");
  expect(html).toContain(retentionRatings.allStars);
  expect(html).toContain("Très bon couscous");
  expect(html).toContain(retentionRatings.noComment);
  // The first review has no reply; the second's reply window has passed.
  expect(html.split(retentionRatings.sendReply)).toHaveLength(2);
  expect(html.split(retentionRatings.sendReport)).toHaveLength(3);
  expect(html).toContain(retentionRatings.loadMore);
});

test("[MER-20] shows per-review outcomes and load failures", () => {
  const { reviews: rows } = ratingsMockState();
  const { retentionRatings } = getMessages("en");
  const notice = {
    ratingId: ids.ratingId,
    action: "report" as const,
    result: { kind: "saved" as const },
  };
  expect(
    reviews({ view: { kind: "ready", reviews: rows, nextCursor: null }, notice }, "en"),
  ).toContain(retentionRatings.reportSaved);
  expect(reviews({ view: { kind: "not-found" } }, "en")).toContain(retentionRatings.notFound);
});
