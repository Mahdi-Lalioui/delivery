import { expect, test } from "vitest";
import { readFavourites, toggleFavourite } from "../src/discovery/favourites";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

const first = "019d6abc-1234-7234-8234-123456789000";
const second = "019d6abc-1234-7234-8234-123456789001";

test("[CUS-01] saves and removes favourite restaurants on this device", () => {
  const storage = memoryStorage();
  expect(readFavourites(storage)).toEqual(new Set());
  expect(toggleFavourite(storage, first)).toBe(true);
  expect(toggleFavourite(storage, second)).toBe(true);
  expect(readFavourites(storage)).toEqual(new Set([first, second]));
  expect(toggleFavourite(storage, first)).toBe(false);
  expect(readFavourites(storage)).toEqual(new Set([second]));
});

test("[CUS-01] ignores a corrupted favourites entry", () => {
  const storage = memoryStorage();
  storage.setItem("awid:favourites", "{not json");
  expect(readFavourites(storage)).toEqual(new Set());
  storage.setItem("awid:favourites", JSON.stringify([first, 42, "not-an-id"]));
  expect(readFavourites(storage)).toEqual(new Set([first]));
});
