import palettes from "@zaafran/tokens/palettes.json" with { type: "json" };
import sharp from "sharp";
import { beforeAll, expect, test } from "vitest";
import { createNameOutliner, readDemoFont } from "../src/demo-name-outline.ts";
import { renderDemoPlaceholder } from "../src/demo-placeholder.ts";

const uploadLimitBytes = 8 * 1024 * 1024;
const dish = {
  itemId: "01932f18-3150-7c33-8a7a-0000000000a1",
  cuisine: "algerian",
  names: { ar: "كسكس بالخضر", fr: "Couscous aux légumes" },
};
let outline: ReturnType<typeof createNameOutliner>;

beforeAll(async () => {
  outline = createNameOutliner(await readDemoFont());
});

async function pixels(png: Buffer, region?: { top: number; height: number }) {
  const image = sharp(png).flatten({ background: "#ffffff" });
  const area = region ? image.extract({ left: 0, width: 1280, ...region }) : image;
  return area.raw().toBuffer({ resolveWithObject: true });
}

function inkShare(data: Buffer) {
  const ink = palettes.light.text;
  const [r, g, b] = [1, 3, 5].map((start) => Number.parseInt(ink.slice(start, start + 2), 16));
  let count = 0;
  for (let index = 0; index + 2 < data.length; index += 3) {
    const distance =
      Math.abs((data[index] ?? 0) - (r ?? 0)) +
      Math.abs((data[index + 1] ?? 0) - (g ?? 0)) +
      Math.abs((data[index + 2] ?? 0) - (b ?? 0));
    if (distance < 48) count += 1;
  }
  return count / (data.length / 3);
}

test("renders a 4:3 PNG at the largest variant width, within the upload limit", async () => {
  const png = await renderDemoPlaceholder(dish, outline);
  const metadata = await sharp(png).metadata();
  expect([metadata.format, metadata.width, metadata.height]).toEqual(["png", 1280, 960]);
  expect(png.length).toBeLessThan(uploadLimitBytes);
});

test("renders the same dish byte for byte every time", async () => {
  const first = await renderDemoPlaceholder(dish, outline);
  expect((await renderDemoPlaceholder(dish, outline)).equals(first)).toBe(true);
});

test("draws the icon above and both names below in ink", async () => {
  const png = await renderDemoPlaceholder(dish, outline);
  const icon = await pixels(png, { top: 120, height: 360 });
  const names = await pixels(png, { top: 560, height: 320 });
  expect(inkShare(icon.data)).toBeGreaterThan(0.01);
  expect(inkShare(names.data)).toBeGreaterThan(0.02);
  const blank = await pixels(png, { top: 0, height: 60 });
  expect(inkShare(blank.data)).toBe(0);
});

test("picks the gradient from the dish id, so neighbouring dishes differ", async () => {
  const corners = new Set<string>();
  for (const suffix of ["a1", "a2", "a3", "a4", "a5", "a6"]) {
    const png = await renderDemoPlaceholder(
      { ...dish, itemId: `01932f18-3150-7c33-8a7a-0000000000${suffix}` },
      outline,
    );
    const { data } = await pixels(png, { top: 0, height: 1 });
    corners.add([data[0], data[1], data[2]].join(","));
  }
  expect(corners.size).toBeGreaterThanOrEqual(3);
});
