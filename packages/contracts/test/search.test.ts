import { expect, test } from "vitest";
import { publicSearchOutput, publicSearchQuery } from "../src/search.ts";

const id = "01932f18-3150-7c33-8a7a-53acfd343001";

test("[CUS-05:contract] accepts Arabic and Arabizi while rejecting unbounded or private input", () => {
  expect(publicSearchQuery.parse({ q: " شاورما " })).toEqual({ q: "شاورما", limit: 12 });
  expect(publicSearchQuery.parse({ q: "chawarma", limit: "2" })).toEqual({
    q: "chawarma",
    limit: 2,
  });
  for (const query of [
    { q: " " },
    { q: "x".repeat(101) },
    { q: "x\0" },
    { q: "pizza", limit: "25" },
    { q: "pizza", longitude: "3" },
  ]) {
    expect(publicSearchQuery.safeParse(query).success).toBe(false);
  }
});

test("[CUS-05:contract] keeps results grouped and projects a bounded customer-safe dish", () => {
  const dish = {
    itemId: id,
    merchantId: id,
    merchantSlug: "table-fictive",
    merchantName: "Table fictive",
    names: { ar: "شاورما" },
    priceDzd: 500,
    photoMediaId: null,
  };
  expect(publicSearchOutput.parse({ restaurants: [], dishes: [dish] })).toEqual({
    restaurants: [],
    dishes: [dish],
  });
  expect(
    publicSearchOutput.safeParse({
      restaurants: [],
      dishes: [{ ...dish, storageKey: "private/photo" }],
    }).success,
  ).toBe(false);
});
