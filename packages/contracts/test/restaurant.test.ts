import { expect, test } from "vitest";
import {
  publicRestaurantCategoryParams,
  publicRestaurantItemOutput,
  publicRestaurantItemParams,
  publicRestaurantItemQuery,
  publicRestaurantItemsOutput,
  publicRestaurantItemsQuery,
  publicRestaurantOutput,
  publicRestaurantParams,
} from "../src/restaurant.ts";

const id = "01932f18-3150-7c33-8a7a-53acfd343001";
const nextId = "01932f18-3150-7c33-8a7a-53acfd343002";
const names = { ar: "طبق تجريبي", fr: "Plat fictif" };
const item = {
  itemId: id,
  names,
  descriptions: { fr: "Description fictive" },
  priceDzd: 750,
  photoId: nextId,
  tags: ["vegetarian"],
  isAvailable: false,
};
const category = { categoryId: id, names, position: 0, availability: null };
const restaurant = {
  merchantId: id,
  slug: "restaurant-fictif-42",
  name: "Restaurant fictif",
  cuisines: ["algerian"],
  communeId: nextId,
  coverMediaId: null,
  logoMediaId: null,
  isOpen: false,
  nextOpensAt: null,
  hours: {
    weekly: Array.from({ length: 7 }, (_, weekday) => ({ weekday, ranges: [] })),
    specialDates: [],
  },
  pausedUntil: null,
};

test("[CUS-07] exposes a public restaurant, hours and ordered categories without editor state", () => {
  const output = { restaurant, revision: 4, categories: [category] };
  expect(publicRestaurantOutput.parse(output)).toEqual(output);
  expect(publicRestaurantOutput.safeParse({ ...output, sessionId: id }).success).toBe(false);
  expect(
    publicRestaurantOutput.safeParse({
      ...output,
      restaurant: { ...restaurant, ownerName: "Private owner" },
    }).success,
  ).toBe(false);
  expect(
    publicRestaurantOutput.safeParse({
      ...output,
      restaurant: { ...restaurant, pausedUntil: "2026-11-08T18:30:00+01:00" },
    }).success,
  ).toBe(true);
  expect(
    publicRestaurantOutput.safeParse({
      ...output,
      restaurant: { ...restaurant, hours: { ...restaurant.hours, weekly: [] } },
    }).success,
  ).toBe(false);
  expect(
    publicRestaurantOutput.safeParse({ ...output, categories: Array(1001).fill(category) }).success,
  ).toBe(false);
});

test("[CUS-07] bounds public path parameters and rejects unexpected query fields", () => {
  expect(publicRestaurantParams.parse({ slug: "restaurant-fictif-42" })).toEqual({
    slug: "restaurant-fictif-42",
  });
  for (const slug of ["", "a".repeat(201), "../private", "a/b", "a\0b"]) {
    expect(publicRestaurantParams.safeParse({ slug }).success).toBe(false);
  }
  expect(publicRestaurantCategoryParams.parse({ slug: restaurant.slug, categoryId: id })).toEqual({
    slug: restaurant.slug,
    categoryId: id,
  });
  expect(
    publicRestaurantItemParams.safeParse({ slug: restaurant.slug, itemId: "bad" }).success,
  ).toBe(false);
  expect(publicRestaurantItemsQuery.parse({})).toEqual({ limit: 50 });
  expect(publicRestaurantItemsQuery.parse({ limit: "100", cursor: `4~${id}` })).toEqual({
    limit: 100,
    cursor: `4~${id}`,
  });
  for (const query of [{ limit: "0" }, { limit: "101" }, { cursor: "bad" }, { categoryId: id }]) {
    expect(publicRestaurantItemsQuery.safeParse(query).success).toBe(false);
  }
});

test("[CUS-07] binds category item pagination to the menu revision and excludes private fields", () => {
  const output = { revision: 4, items: [item], nextCursor: `4~${id}` };
  expect(publicRestaurantItemsOutput.parse(output)).toEqual(output);
  expect(publicRestaurantItemsOutput.safeParse({ ...output, nextCursor: `3~${id}` }).success).toBe(
    false,
  );
  expect(
    publicRestaurantItemsOutput.safeParse({ ...output, items: Array(101).fill(item) }).success,
  ).toBe(false);
  for (const privateFields of [
    { moderationStatus: "approved" },
    { storageKey: "private/photo" },
    { optionGroupIds: [id] },
    { soldOutUntil: null },
  ]) {
    expect(
      publicRestaurantItemsOutput.safeParse({ ...output, items: [{ ...item, ...privateFields }] })
        .success,
    ).toBe(false);
  }
});

test("[CUS-08] requires a valid detail revision and preserves option selection constraints", () => {
  expect(publicRestaurantItemQuery.parse({ expectedRevision: "4" })).toEqual({
    expectedRevision: 4,
  });
  for (const expectedRevision of [undefined, "-1", "4.5", "004", "4e2"]) {
    expect(publicRestaurantItemQuery.safeParse({ expectedRevision }).success).toBe(false);
  }
  const group = {
    optionGroupId: id,
    names,
    minimum: 1,
    maximum: 1,
    options: [{ optionId: nextId, names, priceDeltaDzd: 50, isDefault: false, isAvailable: true }],
  };
  const detail = { revision: 4, item, optionGroups: [group] };
  expect(publicRestaurantItemOutput.parse(detail)).toEqual(detail);
  expect(publicRestaurantItemOutput.safeParse({ ...detail, sessionId: id }).success).toBe(false);
  for (const invalidGroup of [
    { ...group, minimum: 2 },
    { ...group, maximum: 2 },
    { ...group, options: [{ ...group.options[0], priceDeltaDzd: -1 }] },
  ]) {
    expect(
      publicRestaurantItemOutput.safeParse({ ...detail, optionGroups: [invalidGroup] }).success,
    ).toBe(false);
  }
  expect(
    publicRestaurantItemOutput.safeParse({ ...detail, optionGroups: Array(51).fill(group) })
      .success,
  ).toBe(false);
});
