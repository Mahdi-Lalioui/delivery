import { expect, test } from "vitest";
import { publicFeedOutput, publicFeedQuery } from "../src/feed.ts";

const id = "01932f18-3150-7c33-8a7a-53acfd343001";
const restaurant = {
  merchantId: id,
  slug: "table-fictive",
  name: "Table fictive",
  cuisines: ["algerian"],
  communeId: id,
  coverMediaId: null,
  logoMediaId: null,
  isOpen: false,
  nextOpensAt: "2026-11-09T11:00:00.000Z",
};

test("[CUS-01:contract] bounds anonymous feed pages and rejects precise location in the URL", () => {
  expect(publicFeedQuery.parse({})).toEqual({ limit: 24 });
  expect(publicFeedQuery.parse({ limit: "12", cursor: id })).toEqual({ limit: 12, cursor: id });
  for (const query of [
    { limit: "51" },
    { limit: "0" },
    { cursor: "invalid" },
    { latitude: "36.76" },
  ]) {
    expect(publicFeedQuery.safeParse(query).success).toBe(false);
  }
});

test("[CUS-04:contract] returns only public card fields and a continuation cursor", () => {
  const page = { restaurants: [restaurant], nextCursor: id };
  expect(publicFeedOutput.parse(page)).toEqual(page);
  expect(publicFeedOutput.parse({ restaurants: [], nextCursor: null })).toEqual({
    restaurants: [],
    nextCursor: null,
  });
  for (const extra of [
    { ownerName: "Private" },
    { storageKey: "private/example" },
    { rating: 5.1 },
  ]) {
    expect(
      publicFeedOutput.safeParse({ ...page, restaurants: [{ ...restaurant, ...extra }] }).success,
    ).toBe(false);
  }
});

test("[CUS-06:contract] parses public filters and rejects arbitrary inputs", () => {
  expect(
    publicFeedQuery.parse({
      cuisine: "algerian",
      openNow: "false",
      freeDelivery: "true",
      maxEtaMinutes: "30",
      minRating: "4",
      priceLevel: "2",
      sort: "eta",
      communeId: id,
    }),
  ).toEqual({
    limit: 24,
    cuisine: "algerian",
    openNow: false,
    freeDelivery: true,
    maxEtaMinutes: 30,
    minRating: 4,
    priceLevel: 2,
    sort: "eta",
    communeId: id,
  });
  for (const query of [{ openNow: "yes" }, { maxEtaMinutes: "25" }, { sort: "name" }]) {
    expect(publicFeedQuery.safeParse(query).success).toBe(false);
  }
});

test("[CUS-04:contract] publishes bounded rating, ETA and delivery costs", () => {
  const card = {
    ...restaurant,
    rating: 4.6,
    ratingCount: 71,
    etaMinutes: { min: 20, max: 30 },
    deliveryFeeDzd: 0,
  };
  expect(publicFeedOutput.parse({ restaurants: [card], nextCursor: null }).restaurants).toEqual([
    card,
  ]);
  expect(
    publicFeedOutput.safeParse({
      restaurants: [{ ...card, etaMinutes: { min: 30, max: 20 } }],
      nextCursor: null,
    }).success,
  ).toBe(false);
});

test("[CUS-06:contract] accepts fee ordering and public distance in whole metres", () => {
  expect(publicFeedQuery.parse({ sort: "fee", communeId: id })).toEqual({
    limit: 24,
    sort: "fee",
    communeId: id,
  });
  const page = { restaurants: [{ ...restaurant, distanceMeters: 1750 }], nextCursor: null };
  expect(publicFeedOutput.parse(page)).toEqual(page);
  for (const distanceMeters of [-1, 1.5]) {
    expect(
      publicFeedOutput.safeParse({
        ...page,
        restaurants: [{ ...restaurant, distanceMeters }],
      }).success,
    ).toBe(false);
  }
});

test("[CUS-06:contract] parses pickup, scheduled opening and vegetarian filters", () => {
  const availableAt = "2026-11-12T19:15:00.000Z";
  expect(
    publicFeedQuery.parse({ fulfilment: "pickup", availableAt, dietary: "vegetarian" }),
  ).toEqual({ limit: 24, fulfilment: "pickup", availableAt, dietary: "vegetarian" });
  for (const query of [
    { fulfilment: "dine-in" },
    { availableAt: "2026-11-12" },
    { dietary: "halal" },
  ]) {
    expect(publicFeedQuery.safeParse(query).success).toBe(false);
  }
  const card = {
    ...restaurant,
    offersPickup: true,
    pin: { latitude: 36.77, longitude: 3.05 },
    dietary: ["vegetarian"],
  };
  expect(publicFeedOutput.parse({ restaurants: [card], nextCursor: null }).restaurants).toEqual([
    card,
  ]);
});

test("[CUS-06:contract] accepts exact counts, publication and budget filters", () => {
  expect(
    publicFeedQuery.parse({
      includeCount: "true",
      newOnly: "true",
      maxMinimumOrderDzd: "1000",
    }),
  ).toEqual({ limit: 24, includeCount: true, newOnly: true, maxMinimumOrderDzd: 1000 });
  for (const query of [
    { includeCount: "yes" },
    { newOnly: "1" },
    { maxMinimumOrderDzd: "-1" },
    { maxMinimumOrderDzd: "1000.50" },
    { maxMinimumOrderDzd: "2147483648" },
  ]) {
    expect(publicFeedQuery.safeParse(query).success).toBe(false);
  }
  const page = {
    restaurants: [{ ...restaurant, isNew: true }],
    nextCursor: id,
    totalCount: 2,
  };
  expect(publicFeedOutput.parse(page)).toEqual(page);
  expect(publicFeedOutput.safeParse({ ...page, totalCount: -1 }).success).toBe(false);
});
