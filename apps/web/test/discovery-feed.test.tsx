import type { publicRestaurantCard } from "@zaafran/contracts/feed";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { DiscoveryFeed } from "../src/discovery/feed";
import { FeedContent } from "../src/discovery/feed-content";

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const coverMediaId = "019d6abc-1234-7234-8234-123456789001";
const logoMediaId = "019d6abc-1234-7234-8234-123456789002";
const communeId = "019d6abc-1234-7234-8234-123456789003";
const openRestaurant = {
  merchantId,
  slug: "les-jardins",
  name: "Les Jardins",
  cuisines: ["algerian", "grill"],
  communeId,
  coverMediaId,
  logoMediaId,
  isOpen: true,
  nextOpensAt: null,
} satisfies ReturnType<typeof publicRestaurantCard.parse>;
const onLoad = () => undefined;

test("[CUS-01] renders a named Arabic section and announces the initial skeleton", () => {
  const html = renderToStaticMarkup(<DiscoveryFeed locale="ar" />);
  expect(html).toMatch(/<section[^>]+aria-labelledby="[^"]+"/u);
  expect(html).toMatch(/<h2[^>]*>كل المطاعم<\/h2>/u);
  expect(html).toContain('role="status"');
  expect(html).toContain("جارٍ تحميل المطاعم");
  expect(html).toContain('aria-hidden="true"');
});

test("[CUS-04] renders localized cuisines, availability, and public image variants with localized restaurant links", () => {
  const html = renderToStaticMarkup(
    <FeedContent
      locale="fr"
      state={{ phase: "ready", restaurants: [openRestaurant], nextCursor: null }}
      onLoad={onLoad}
    />,
  );
  const photoPath = `/v1/merchants/${merchantId}/profile/photos`;
  expect(html).toContain("<bdi>Les Jardins</bdi>");
  expect(html).toContain("Cuisine algérienne");
  expect(html).toContain("Grillades");
  expect(html).toContain("Ouvert");
  expect(html).toContain('type="image/avif"');
  expect(html).toContain(`${photoPath}/${coverMediaId}/variants/avif/960 960w`);
  expect(html).toContain(`${photoPath}/${coverMediaId}/variants/webp/640`);
  expect(html).toContain(`${photoPath}/${logoMediaId}/variants/webp/160`);
  expect(html).toContain('width="640" height="360"');
  expect(html).toContain('width="160" height="160"');
  expect(html).toContain('loading="lazy"');
  expect(html).toContain(`href="/fr/restaurants/${openRestaurant.slug}"`);
});

test("[CUS-03] shows an Algiers opening time and placeholder for a closed restaurant", () => {
  const restaurant = {
    ...openRestaurant,
    isOpen: false,
    coverMediaId: null,
    logoMediaId: null,
    nextOpensAt: "2026-11-08T17:00:00.000Z",
  };
  const html = renderToStaticMarkup(
    <FeedContent
      locale="en"
      state={{ phase: "ready", restaurants: [restaurant], nextCursor: merchantId }}
      onLoad={onLoad}
    />,
  );
  expect(html).toContain("Closed");
  expect(html).toContain('dateTime="2026-11-08T17:00:00.000Z"');
  expect(html).toContain("18:00");
  expect(html).toContain("Load more restaurants");
  expect(html).not.toContain("/variants/");
});

test("[CUS-01] distinguishes an empty feed from a failed page and keeps loaded cards on failure", () => {
  const empty = renderToStaticMarkup(
    <FeedContent
      locale="en"
      state={{ phase: "ready", restaurants: [], nextCursor: null }}
      onLoad={onLoad}
    />,
  );
  const failed = renderToStaticMarkup(
    <FeedContent
      locale="en"
      state={{ phase: "error", restaurants: [openRestaurant], nextCursor: merchantId }}
      onLoad={onLoad}
    />,
  );
  expect(empty).toContain("No restaurants to show yet.");
  expect(empty).not.toContain("Try again");
  expect(failed).toContain("Les Jardins");
  expect(failed).toContain('role="alert"');
  expect(failed).toContain("Try again");
});

test("[CUS-04] localizes legacy and unrecognized cuisine codes", () => {
  const html = renderToStaticMarkup(
    <FeedContent
      locale="fr"
      state={{
        phase: "ready",
        restaurants: [{ ...openRestaurant, cuisines: ["bakery", "legacy-code", "future-code"] }],
        nextCursor: null,
      }}
      onLoad={onLoad}
    />,
  );
  expect(html).toContain("<bdi>Boulangerie</bdi>");
  expect(html.match(/<bdi>Autre cuisine<\/bdi>/gu)).toHaveLength(1);
  expect(html).not.toContain("legacy code");
  expect(html).not.toContain("future code");
});

test("[CUS-01] keeps the retry button in place while the initial retry is pending", () => {
  const html = renderToStaticMarkup(
    <FeedContent
      locale="en"
      state={{ phase: "retrying", restaurants: [], nextCursor: null }}
      onLoad={onLoad}
    />,
  );
  expect(html).toMatch(/<button[^>]+aria-disabled="true"[^>]*>Try again<\/button>/u);
  expect(html).toContain("Loading restaurants…");
});

test("[CUS-04] shows approximate distance with the card’s rating, ETA and fee", () => {
  const html = renderToStaticMarkup(
    <FeedContent
      locale="en"
      state={{
        phase: "ready",
        restaurants: [
          {
            ...openRestaurant,
            distanceMeters: 1750,
            rating: 4.6,
            ratingCount: 30,
            etaMinutes: { min: 15, max: 25 },
            deliveryFeeDzd: 0,
          },
        ],
        nextCursor: null,
      }}
      onLoad={onLoad}
    />,
  );
  expect(html).toContain("Approximate distance");
  expect(html).toContain("1.8 km");
  expect(html).toContain('data-free="true"');
});
