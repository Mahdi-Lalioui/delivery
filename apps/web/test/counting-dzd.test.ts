import { describe, expect, it } from "vitest";
import { countedDzd } from "../src/restaurant/counting-dzd";

describe("counting prices", () => {
  it("[CUS-07] starts at the old amount and lands exactly on the new one", () => {
    expect(countedDzd(650, 800, 0)).toBe(650);
    expect(countedDzd(650, 800, 1)).toBe(800);
    expect(countedDzd(650, 800, 4)).toBe(800);
  });

  it("[CUS-07] moves in whole dinars in both directions", () => {
    const up = countedDzd(650, 800, 0.37);
    const down = countedDzd(800, 650, 0.37);
    expect(Number.isInteger(up) && up > 650 && up < 800).toBe(true);
    expect(Number.isInteger(down) && down < 800 && down > 650).toBe(true);
  });
});
