import { describe, expect, it } from "vitest";
import { cssDurationMs, flightTransform } from "../src/restaurant/photo-flight";

describe("dish photo flight", () => {
  it("[CUS-07] reads minified and plain CSS time tokens in milliseconds", () => {
    expect(cssDurationMs(".4s")).toBe(400);
    expect(cssDurationMs(" 250ms")).toBe(250);
    expect(cssDurationMs("1.2s")).toBe(1200);
    expect(cssDurationMs("fast")).toBeNaN();
  });

  it("[CUS-07] places the sheet photo exactly over the tapped card photo", () => {
    const card = { left: 16, top: 556, width: 200, height: 150 };
    const sheet = { left: 0, top: 80, width: 400, height: 300 };
    expect(flightTransform(card, sheet)).toBe("translate(16px, 476px) scale(0.5, 0.5)");
  });
});
