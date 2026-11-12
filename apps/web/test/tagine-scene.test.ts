import { describe, expect, it } from "vitest";
import { lidPose, steamPuff, tagineTimeline } from "../src/marketing/moments/tagine-scene";

describe("order-confirmed tagine", () => {
  it("[CUS-18] starts closed and settles open with the lid tipped back", () => {
    expect(lidPose(0)).toEqual({ lift: 0, tilt: -0 });
    const open = lidPose(tagineTimeline.lidUp);
    expect(open.lift).toBeCloseTo(0.9, 1);
    expect(open.tilt).toBeCloseTo(-0.45, 1);
    expect(lidPose(10_000)).toEqual(open);
  });

  it("[CUS-18] springs past open before settling", () => {
    const peak = Math.max(...Array.from({ length: 90 }, (_, step) => lidPose(step * 10).lift));
    expect(peak).toBeGreaterThan(0.9);
  });

  it("[CUS-18] lets steam rise and fade before the scene hands over to tracking", () => {
    expect(steamPuff(0, 0).opacity).toBe(0);
    expect(steamPuff(1000, 0).opacity).toBeGreaterThan(0);
    for (let index = 0; index < 9; index += 1) {
      expect(steamPuff(tagineTimeline.fadeOut, index).opacity).toBe(0);
    }
  });
});
