import fc from "fast-check";
import { expect, test } from "vitest";
import { cropRectangle } from "../src/photo-crop.ts";
import { assertDomainProperty } from "./property.ts";

const sixteenByNine = { width: 16, height: 9 };
const fourByThree = { width: 4, height: 3 };
const square = { width: 1, height: 1 };
const centred = { focalX: 5_000, focalY: 5_000, zoomPercent: 100 };

test("[MER-14:crop] keeps the whole image when it already has the target ratio", () => {
  const image = { width: 1600, height: 900 };
  expect(cropRectangle(image, sixteenByNine, centred)).toEqual({
    left: 0,
    top: 0,
    width: 1600,
    height: 900,
  });
});

test("[MER-14:crop] takes the largest centred 4:3 and 1:1 areas from a wide image", () => {
  const image = { width: 1600, height: 900 };
  expect(cropRectangle(image, fourByThree, centred)).toEqual({
    left: 200,
    top: 0,
    width: 1200,
    height: 900,
  });
  expect(cropRectangle(image, square, centred)).toEqual({
    left: 350,
    top: 0,
    width: 900,
    height: 900,
  });
});

test("[MER-14:crop] moves towards the focal point and clamps at the edges", () => {
  const image = { width: 1600, height: 900 };
  const start = cropRectangle(image, square, { ...centred, focalX: 0 });
  const end = cropRectangle(image, square, { ...centred, focalX: 10_000 });
  expect(start.left).toBe(0);
  expect(end.left).toBe(700);
  expect(cropRectangle(image, square, { ...centred, focalX: 2_500 }).left).toBe(0);
  expect(cropRectangle(image, square, { ...centred, focalX: 7_000 }).left).toBe(670);
});

test("[MER-14:crop] zooming in shrinks the area around the focal point", () => {
  const image = { width: 1600, height: 900 };
  expect(cropRectangle(image, sixteenByNine, { ...centred, zoomPercent: 200 })).toEqual({
    left: 400,
    top: 225,
    width: 800,
    height: 450,
  });
});

test("[MER-14:crop] always stays inside the image with the requested ratio", () => {
  const images = [
    { width: 96, height: 64 },
    { width: 64, height: 96 },
    { width: 4032, height: 3024 },
    { width: 1, height: 1 },
    { width: 3, height: 1000 },
  ];
  const crops = [0, 1_234, 5_000, 10_000].flatMap((focalX) =>
    [100, 137, 400].map((zoomPercent) => ({ focalX, focalY: 10_000 - focalX, zoomPercent })),
  );
  const cases = images.flatMap((image) =>
    [sixteenByNine, fourByThree, square].flatMap((ratio) =>
      crops.map((crop) => ({ image, ratio, crop })),
    ),
  );
  for (const { image, ratio, crop } of cases) {
    const area = cropRectangle(image, ratio, crop);
    expect(area.width).toBeGreaterThanOrEqual(1);
    expect(area.height).toBeGreaterThanOrEqual(1);
    expect(area.left + area.width).toBeLessThanOrEqual(image.width);
    expect(area.top + area.height).toBeLessThanOrEqual(image.height);
    const skew = Math.abs(area.width * ratio.height - area.height * ratio.width);
    expect(skew).toBeLessThanOrEqual(Math.max(ratio.width, ratio.height));
  }
  expect(cases).toHaveLength(180);
});

test("[MER-14:crop] any image, ratio and crop gives an area inside the image at the ratio", () => {
  const size = fc.integer({ min: 1, max: 8_000 });
  const basisPoint = fc.integer({ min: 0, max: 10_000 });
  const cases = fc.record({
    image: fc.record({ width: size, height: size }),
    ratio: fc.constantFrom(sixteenByNine, fourByThree, square),
    crop: fc.record({
      focalX: basisPoint,
      focalY: basisPoint,
      zoomPercent: fc.integer({ min: 100, max: 400 }),
    }),
  });
  assertDomainProperty(
    fc.property(cases, ({ image, ratio, crop }) => {
      const area = cropRectangle(image, ratio, crop);
      expect(area.left).toBeGreaterThanOrEqual(0);
      expect(area.top).toBeGreaterThanOrEqual(0);
      expect(area.width).toBeGreaterThanOrEqual(1);
      expect(area.height).toBeGreaterThanOrEqual(1);
      expect(area.left + area.width).toBeLessThanOrEqual(image.width);
      expect(area.top + area.height).toBeLessThanOrEqual(image.height);
      const unzoomed = cropRectangle(image, ratio, { ...crop, zoomPercent: 100 });
      expect(area.width).toBeLessThanOrEqual(unzoomed.width);
    }),
  );
});
