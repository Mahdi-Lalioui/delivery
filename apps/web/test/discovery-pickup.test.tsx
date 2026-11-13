import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { activeFilters, filtersFromSearch } from "../src/discovery/filter-state";
import { FulfilmentToggle } from "../src/discovery/fulfilment-toggle";
import { groupPins, pickupPins, pinsBounds, pinsCentre } from "../src/discovery/pickup-pins";

const base = {
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

test("[CUS-04] pickup is a choice kept in the address, not a removable chip", () => {
  const filters = filtersFromSearch("?fulfilment=pickup&openNow=true");
  expect(filters).toEqual({ fulfilment: "pickup", openNow: "true" });
  expect(activeFilters(filters).map(({ key }) => key)).toEqual(["openNow"]);
  expect(filtersFromSearch("?fulfilment=drone")).toEqual({});
});

test("[CUS-04] maps only restaurants that offer pickup and have a pin", () => {
  const pins = pickupPins([
    { ...base, offersPickup: true, pin: { latitude: 36.7, longitude: 3.0 } },
    { ...base, slug: "nopin", offersPickup: true },
    { ...base, slug: "delivery", offersPickup: false, pin: { latitude: 36.8, longitude: 3.1 } },
    { ...base, slug: "far", offersPickup: true, pin: { latitude: 36.8, longitude: 3.2 } },
  ]);
  expect(pins.map(({ slug }) => slug)).toEqual(["dar", "far"]);
  expect(pinsCentre(pins)).toEqual({ latitude: 36.75, longitude: 3.1 });
  expect(pinsCentre([])).toBeNull();
  expect(pinsBounds(pins)).toEqual([
    [3.0, 36.7],
    [3.2, 36.8],
  ]);
  expect(pinsBounds([])).toBeNull();
});

test("[CUS-04] the Delivery / Pickup switch marks the current mode", () => {
  const html = renderToStaticMarkup(
    <FulfilmentToggle locale="fr" filters={{ fulfilment: "pickup" }} onChange={() => undefined} />,
  );
  expect(html).toContain('data-mode="pickup"');
  expect(html).toContain("Mode de récupération");
  expect(html.match(/checked=""/gu)).toHaveLength(1);
});

test("[CUS-04] a pin card carries the logo, rating and wait it can prove", () => {
  const [pin] = pickupPins([
    {
      ...base,
      logoMediaId: "019d6abc-1234-7234-8234-123456789009",
      rating: 4.6,
      etaMinutes: { min: 20, max: 30 },
      offersPickup: true,
      pin: { latitude: 36.7, longitude: 3.0 },
    },
  ]);
  expect(pin).toMatchObject({
    logoUrl: `/v1/merchants/${base.merchantId}/profile/photos/019d6abc-1234-7234-8234-123456789009/variants/webp/160`,
    rating: 4.6,
    etaMinutes: { min: 20, max: 30 },
  });
  const [bare] = pickupPins([{ ...base, offersPickup: true, pin: { latitude: 1, longitude: 1 } }]);
  expect(bare).toMatchObject({ logoUrl: null, rating: null, etaMinutes: null });
});

test("[CUS-04] pins whose cards would overlap gather into one cluster", () => {
  const card = { width: 168, height: 60 };
  const groups = groupPins(
    [
      { x: 0, y: 0 },
      { x: 150, y: 50 },
      { x: 400, y: 0 },
      { x: 0, y: 80 },
      { x: 60, y: 20 },
    ],
    card,
  );
  expect(groups).toEqual([[0, 1, 4], [2], [3]]);
  expect(groupPins([], card)).toEqual([]);
});
