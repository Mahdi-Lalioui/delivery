import palettes from "@zaafran/tokens/palettes.json" with { type: "json" };
import sharp from "sharp";
import { expect, test } from "vitest";
import { cuisineIcon } from "../src/demo-cuisine-icons.ts";

// The cuisines of the twelve demo restaurants (packages/db/src/demo-merchants-data.ts).
const demoCuisines = ["algerian", "grill", "pizza", "fast-food", "seafood", "pastry"];
const ink = palettes.light.text;
const saffron = palettes.light.primary;

async function rasterise(icon: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24">${icon}</svg>`;
  const { data } = await sharp(Buffer.from(svg))
    .flatten({ background: "#ffffff" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data;
}

function countPixels(data: Buffer, hex: string) {
  const [r, g, b] = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  let count = 0;
  for (let index = 0; index + 2 < data.length; index += 3) {
    const near = (offset: number, value = 0) => Math.abs((data[index + offset] ?? 0) - value) < 24;
    if (near(0, r) && near(1, g) && near(2, b)) count += 1;
  }
  return count;
}

test("each demo cuisine has its own icon, and others fall back to a plate", () => {
  const icons = demoCuisines.map(cuisineIcon);
  const fallback = cuisineIcon("unknown-cuisine");
  expect(new Set([...icons, fallback]).size).toBe(demoCuisines.length + 1);
  expect(cuisineIcon("another-unknown")).toBe(fallback);
});

test("icons are duotone in the ink and saffron tokens only", async () => {
  for (const cuisine of [...demoCuisines, "unknown-cuisine"]) {
    const icon = cuisineIcon(cuisine);
    const colours = new Set(icon.match(/#[0-9A-Fa-f]{6}/g));
    expect(colours).toEqual(new Set([ink, saffron]));
    expect(icon).not.toMatch(/<text|<image|href=/);

    const pixels = await rasterise(icon);
    expect(countPixels(pixels, ink)).toBeGreaterThan(100);
    expect(countPixels(pixels, saffron)).toBeGreaterThan(100);
  }
});
