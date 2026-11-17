import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { beforeAll, expect, test } from "vitest";
import { createNameOutliner, readDemoFont } from "../src/demo-name-outline.ts";

type Outliner = ReturnType<typeof createNameOutliner>;
let outline: Outliner;

beforeAll(async () => {
  outline = createNameOutliner(await readDemoFont());
});

async function inkColumns(svg: string, width: number, height: number) {
  const document = `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toString()}"
    height="${height.toString()}"><g transform="translate(0 ${(height * 0.8).toString()})">${svg}</g></svg>`;
  const { data, info } = await sharp(Buffer.from(document))
    .flatten({ background: "#ffffff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const columns = new Set<number>();
  for (let index = 0; index < data.length; index += 1) {
    if ((data[index] ?? 255) < 128) columns.add(index % info.width);
  }
  return columns;
}

test("outlines Arabic and French dish names as paths, at the requested size", async () => {
  for (const name of ["كسكس بالخضر", "Couscous aux légumes"]) {
    const result = outline(name, { fontSize: 48, maxWidth: 1000 });
    expect(result.svg).toMatch(/^<g transform="scale\([\d.]+ -[\d.]+\)">(<path [^>]+\/>)+<\/g>$/);
    expect(result.svg).not.toMatch(/<text/);
    expect(result.fontSize).toBe(48);
    expect(result.width).toBeGreaterThan(48 * 2);
    expect(result.width).toBeLessThanOrEqual(1000);
    const ink = await inkColumns(result.svg, Math.ceil(result.width) + 4, 80);
    expect(ink.size).toBeGreaterThan(result.width / 2);
  }
});

test("draws identically every time, so the rendered placeholder is deterministic", () => {
  const box = { fontSize: 40, maxWidth: 600 };
  expect(outline("شربة فريك", box)).toEqual(outline("شربة فريك", box));
});

test("shrinks a long name to fit the width and never grows a short one", () => {
  const long = outline("Brochettes de poulet grillées au charbon de bois", {
    fontSize: 64,
    maxWidth: 400,
  });
  expect(long.width).toBeLessThanOrEqual(400);
  expect(long.fontSize).toBeLessThan(64);

  const short = outline("Bourek", { fontSize: 64, maxWidth: 400 });
  expect(short.fontSize).toBe(64);
  expect(short.width).toBeLessThan(400);
});

test("refuses a name the demo font cannot draw instead of drawing empty boxes", () => {
  expect(() => outline("寿司", { fontSize: 40, maxWidth: 600 })).toThrow(/cannot draw/);
});

test("refuses font data HarfBuzz cannot read, such as the web WOFF2 subsets", async () => {
  const woff2 = await readFile(
    new URL("../../web/src/fonts/ibm-plex-sans-arabic-600.woff2", import.meta.url),
  );
  const fromWoff2 = createNameOutliner(woff2);
  expect(() => fromWoff2("Rechta", { fontSize: 40, maxWidth: 600 })).toThrow(/cannot draw/);
});
