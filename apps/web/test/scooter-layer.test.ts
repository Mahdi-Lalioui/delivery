import { describe, expect, it } from "vitest";
import { blend } from "../src/tracking/scooter-layer";

const north = { longitude: 3, latitude: 36, heading: 350 };

describe("scooter glide", () => {
  it("[CUS-18] eases position from the last pose to the next", () => {
    const next = { longitude: 3.002, latitude: 36.001, heading: 350 };
    expect(blend(north, next, 0)).toEqual(north);
    expect(blend(north, next, 1)).toEqual(next);
    expect(blend(north, next, 0.5).longitude).toBeGreaterThan(3.001);
  });

  it("[CUS-18] turns the short way across north", () => {
    const pose = blend(north, { ...north, heading: 10 }, 1);
    expect(pose.heading).toBe(370);
  });
});
