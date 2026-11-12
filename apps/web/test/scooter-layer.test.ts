import { describe, expect, it } from "vitest";
import { blend, scooterScale } from "../src/tracking/scooter-layer";

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

describe("scooter size", () => {
  it("[CUS-18] stays about the same on screen as the map zooms", () => {
    const near = scooterScale(18, 36.77);
    const far = scooterScale(16, 36.77);
    expect(far / near).toBeCloseTo(4, 5);
  });

  it("[CUS-18] never draws the scooter smaller than life size", () => {
    expect(scooterScale(24, 36.77)).toBe(1);
  });
});
