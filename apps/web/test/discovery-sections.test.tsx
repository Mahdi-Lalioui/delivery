import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { CustomerTabBar } from "../src/customer/tab-bar";
import { FeedFilterBar } from "../src/discovery/feed-filters";
import { Collections, CuisineChips } from "../src/discovery/feed-sections";

const ignore = () => undefined;

test("[CUS-04][CUS-06] marks active feed filters and the chosen sort", () => {
  const html = renderToStaticMarkup(
    <FeedFilterBar
      locale="fr"
      filters={{ freeDelivery: "true", sort: "rating" }}
      onChange={ignore}
    />,
  );
  expect(html).toMatch(/aria-pressed="true"[^>]*>Livraison offerte</u);
  expect(html).toMatch(/aria-pressed="false"[^>]*>Ouvert</u);
  expect(html).toMatch(/<option value="rating" selected="">Note<\/option>/u);
  expect(html).toContain('aria-label="Filtres"');
});

test("[CUS-04] offers cuisine chips with photos and an All choice", () => {
  const html = renderToStaticMarkup(<CuisineChips locale="ar" value="grill" onChange={ignore} />);
  expect(html).toMatch(
    /aria-pressed="true"[^>]*><img src="\/preview-catalog\/brochettes-320.webp"/u,
  );
  expect(html).toContain("الكل");
  expect(html).toContain('alt=""');
});

test("[CUS-04] editorial collections open a cuisine and carry their photo", () => {
  const html = renderToStaticMarkup(<Collections locale="fr" onChoose={ignore} />);
  expect(html).toContain("Le couscous du vendredi");
  expect(html).toContain('src="/preview-catalog/couscous.webp"');
  expect(html).toContain('width="640" height="400"');
});

test("[CUS-01] the customer tab bar marks the current tab and links per locale", () => {
  const html = renderToStaticMarkup(<CustomerTabBar locale="ar" current="orders" />);
  expect(html).toContain('href="/ar/orders" aria-current="page"');
  expect(html).toContain('href="/ar/discover?search=open"');
  expect(html).toContain('data-current="orders"');
  expect(html).toContain("طلباتي");
});

test("[CUS-04] shows rating, delivery time, free delivery and a favourite toggle on a card", async () => {
  const { FeedCard } = await import("../src/discovery/feed-card");
  const html = renderToStaticMarkup(
    <FeedCard
      locale="fr"
      restaurant={{
        merchantId: "019d6abc-1234-7234-8234-123456789000",
        slug: "dar-yemma",
        name: "Dar Yemma",
        cuisines: ["algerian"],
        communeId: "019d6abc-1234-7234-8234-123456789001",
        coverMediaId: null,
        logoMediaId: null,
        isOpen: true,
        nextOpensAt: null,
        rating: 4.6,
        ratingCount: 212,
        etaMinutes: { min: 20, max: 30 },
        deliveryFeeDzd: 0,
      }}
    />,
  );
  expect(html).toContain('aria-label="Noté 4,6 sur 5 par 212 avis"');
  expect(html).toContain("20–30 min");
  expect(html).toContain("Offerte");
  expect(html).toContain('aria-label="Ajouter Dar Yemma aux favoris"');
  expect(html).toContain('aria-pressed="false"');
});

test("[CUS-04] shows a paid delivery fee in dinars and hides absent rollout fields", async () => {
  const { FeedCard } = await import("../src/discovery/feed-card");
  const base = {
    merchantId: "019d6abc-1234-7234-8234-123456789000",
    slug: "four",
    name: "Le Four",
    cuisines: ["pizza"],
    communeId: "019d6abc-1234-7234-8234-123456789001",
    coverMediaId: null,
    logoMediaId: null,
    isOpen: true,
    nextOpensAt: null,
  };
  const paid = renderToStaticMarkup(
    <FeedCard locale="fr" restaurant={{ ...base, deliveryFeeDzd: 150 }} />,
  );
  expect(paid).toContain("150 DA");
  const bare = renderToStaticMarkup(<FeedCard locale="fr" restaurant={base} />);
  expect(bare).not.toContain("restaurant-feed-meta");
});
