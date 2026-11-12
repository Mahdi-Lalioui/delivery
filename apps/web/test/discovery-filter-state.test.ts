import { expect, test } from "vitest";
import { activeFilters, filtersFromSearch, filtersToSearch } from "../src/discovery/filter-state";

test("[CUS-04][CUS-06] reads only supported feed filters from the URL and drops bad values", () => {
  expect(
    filtersFromSearch("?openNow=true&sort=rating&priceLevel=2&maxEtaMinutes=30&evil=1&sort2=x"),
  ).toEqual({ openNow: "true", sort: "rating", priceLevel: "2", maxEtaMinutes: "30" });
  expect(filtersFromSearch("?sort=cheap&priceLevel=9&minRating=5&cuisine=Bad Value")).toEqual({});
  expect(filtersFromSearch("?cuisine=grill&search=open")).toEqual({ cuisine: "grill" });
});

test("[CUS-06] writes filters back to the query while keeping other parameters", () => {
  expect(filtersToSearch("?search=open&sort=eta", { freeDelivery: "true" })).toBe(
    "?search=open&freeDelivery=true",
  );
  expect(filtersToSearch("", {})).toBe("");
});

test("[CUS-04] lists active filters (not the sort) as removable chips", () => {
  expect(
    activeFilters({ sort: "rating", openNow: "true", priceLevel: "1", acceptsTpe: "true" }).map(
      (filter) => filter.key,
    ),
  ).toEqual(["openNow", "priceLevel", "acceptsTpe"]);
});

test("[CUS-04] keeps the lowest-fee sort in the address", () => {
  expect(filtersFromSearch("?sort=fee")).toEqual({ sort: "fee" });
});
