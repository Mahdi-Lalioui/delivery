import { expect, test } from "vitest";
import { isFirstOrder, rememberOrdered } from "../src/checkout/first-order";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("[CUS-12] celebrates only the first confirmed order on a device", () => {
  const storage = memoryStorage();
  expect(isFirstOrder(storage)).toBe(true);
  rememberOrdered(storage);
  expect(isFirstOrder(storage)).toBe(false);
});

test("[CUS-12] treats blocked storage as a returning diner and never throws", () => {
  const blocked = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  expect(isFirstOrder(blocked)).toBe(false);
  expect(() => {
    rememberOrdered(blocked);
  }).not.toThrow();
});
