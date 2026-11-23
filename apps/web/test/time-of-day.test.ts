import { expect, test } from "vitest";
import { featureFirst, featuredCuisineFor, momentAt } from "../src/discovery/time-of-day";

test("[CUS-04] names the moment of the day from the diner's local hour", () => {
  expect([4, 5, 8, 9, 16, 17, 19, 20, 23, 0].map(momentAt)).toEqual([
    "lil",
    "fajr",
    "fajr",
    "nhar",
    "nhar",
    "maghrib",
    "maghrib",
    "lil",
    "lil",
    "lil",
  ]);
});

test("[CUS-04] features a collection that suits the moment", () => {
  expect(featuredCuisineFor("fajr")).toBe("pastry");
  expect(featuredCuisineFor("nhar")).toBe("algerian");
  expect(featuredCuisineFor("maghrib")).toBe("pastry");
  expect(featuredCuisineFor("lil")).toBe("grill");
  const collections = [{ cuisine: "algerian" }, { cuisine: "grill" }, { cuisine: "pastry" }];
  expect(featureFirst(collections, "lil").map(({ cuisine }) => cuisine)).toEqual([
    "grill",
    "algerian",
    "pastry",
  ]);
});
