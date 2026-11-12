import { describe, expect, it, vi } from "vitest";
import { cardTapTarget } from "../src/restaurant/dish-card";

const onBody = { closest: () => null };
const onControl = { closest: () => ({}) };

describe("tapping a dish card", () => {
  it("[CUS-07] opens the dish when the diner taps the card body", () => {
    const add = { click: vi.fn() };
    const selectors: string[] = [];
    const card = {
      querySelector: (selector: string) => {
        selectors.push(selector);
        return add;
      },
    };
    expect(cardTapTarget(onBody, card)).toBe(add);
    expect(selectors).toEqual([".restaurant-dish-add:enabled"]);
  });

  it("[CUS-07] leaves taps on the card's own controls alone", () => {
    const card = { querySelector: () => ({ click: vi.fn() }) };
    expect(cardTapTarget(onControl, card)).toBeNull();
  });

  it("[CUS-07] finds nothing to press on a sold-out card", () => {
    expect(cardTapTarget(onBody, { querySelector: () => null })).toBeNull();
  });
});
