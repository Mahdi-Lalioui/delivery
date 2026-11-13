import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { activeFilters, filtersFromSearch } from "../src/discovery/filter-state";
import { offerLabel } from "../src/discovery/offer-badge";
import { FeedCard } from "../src/discovery/feed-card";

const card = {
  merchantId: "019d6abc-1234-7234-8234-123456789000",
  slug: "dar",
  name: "Dar",
  cuisines: [],
  communeId: "019d6abc-1234-7234-8234-123456789003",
  coverMediaId: null,
  logoMediaId: null,
  isOpen: true,
  nextOpensAt: null,
};

test("[MON-03] the badge states the saving the quote will apply, in each language", () => {
  const percent = {
    kind: "percent",
    basisPoints: 2000,
    capDzd: 500,
    minimumSubtotalDzd: 0,
  } as const;
  expect(offerLabel(percent, "fr")).toEqual({ short: "−20\u202f%", detail: "jusqu’à 500 DA" });
  expect(offerLabel({ kind: "fixed", amountDzd: 300, minimumSubtotalDzd: 2000 }, "fr")).toEqual({
    short: "−300 DA",
    detail: "dès 2\u202f000 DA",
  });
  expect(offerLabel({ kind: "free_delivery", minimumSubtotalDzd: 0 }, "en")).toEqual({
    short: "Free delivery",
    detail: null,
  });
  expect(
    offerLabel({ kind: "fixed", amountDzd: 300, minimumSubtotalDzd: 0 }, "ar").short,
  ).toContain("300");
});

test("[MON-03] a card with a published offer shows it on the photo and speaks it", () => {
  const html = renderToStaticMarkup(
    <FeedCard
      locale="fr"
      restaurant={{
        ...card,
        offer: { kind: "fixed", amountDzd: 300, minimumSubtotalDzd: 2000 },
      }}
    />,
  );
  expect(html).toContain('class="restaurant-feed-offer"');
  expect(html).toContain("−300 DA");
  expect(html).toContain("dès 2\u202f000 DA");
  expect(renderToStaticMarkup(<FeedCard locale="fr" restaurant={card} />)).not.toContain(
    "restaurant-feed-offer",
  );
});

test("[MON-03] the offers filter lives in the URL and shows as a removable chip", () => {
  const filters = filtersFromSearch("?offers=true&offers=nope");
  expect(filters).toEqual({ offers: "true" });
  expect(activeFilters(filters).map(({ key }) => key)).toEqual(["offers"]);
});
