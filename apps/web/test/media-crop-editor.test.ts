import { expect, test } from "vitest";
import { centredCrop, cropFrame, nudgeCrop } from "../src/media/crop-editor";

const preview = { width: 1280, height: 720 };

test("[MER-14:crop] starts centred at full size", () => {
  expect(centredCrop).toEqual({ focalX: 5_000, focalY: 5_000, zoomPercent: 100 });
});

test.each([
  ["ArrowLeft", false, { focalX: 4_750, focalY: 5_000 }],
  ["ArrowRight", false, { focalX: 5_250, focalY: 5_000 }],
  ["ArrowUp", false, { focalX: 5_000, focalY: 4_750 }],
  ["ArrowDown", false, { focalX: 5_000, focalY: 5_250 }],
  ["ArrowLeft", true, { focalX: 4_000, focalY: 5_000 }],
  ["ArrowDown", true, { focalX: 5_000, focalY: 6_000 }],
] as const)("[MER-14:crop] %s (large: %s) moves the focal point", (key, isLarge, focal) => {
  expect(nudgeCrop(centredCrop, { key, isLarge })).toEqual({ ...focal, zoomPercent: 100 });
});

test("[MER-14:crop] arrows keep their screen direction because photos are never mirrored", () => {
  // The cropper has no locale input: in Arabic, ArrowLeft still moves the point left.
  expect(nudgeCrop(centredCrop, { key: "ArrowLeft", isLarge: false })?.focalX).toBe(4_750);
});

test("[MER-14:crop] plus and minus zoom within 100–400 %", () => {
  const zoomed = nudgeCrop(centredCrop, { key: "+", isLarge: false });
  expect(zoomed?.zoomPercent).toBe(110);
  expect(nudgeCrop(centredCrop, { key: "=", isLarge: true })?.zoomPercent).toBe(150);
  expect(nudgeCrop(centredCrop, { key: "-", isLarge: false })?.zoomPercent).toBe(100);
  const most = { ...centredCrop, zoomPercent: 395 };
  expect(nudgeCrop(most, { key: "+", isLarge: false })?.zoomPercent).toBe(400);
});

test("[MER-14:crop] clamps the focal point to the image", () => {
  const corner = { focalX: 100, focalY: 9_900, zoomPercent: 100 };
  expect(nudgeCrop(corner, { key: "ArrowLeft", isLarge: true })?.focalX).toBe(0);
  expect(nudgeCrop(corner, { key: "ArrowDown", isLarge: true })?.focalY).toBe(10_000);
});

test("[MER-14:crop] Home recentres and other keys are left to the browser", () => {
  const moved = { focalX: 1_000, focalY: 2_000, zoomPercent: 250 };
  expect(nudgeCrop(moved, { key: "Home", isLarge: false })).toEqual(centredCrop);
  expect(nudgeCrop(moved, { key: "Tab", isLarge: false })).toBeUndefined();
  expect(nudgeCrop(moved, { key: "Enter", isLarge: false })).toBeUndefined();
  expect(nudgeCrop(moved, { key: "constructor", isLarge: false })).toBeUndefined();
});

test("[MER-14:crop] frames the area the worker will cut, as percentages of the preview", () => {
  expect(cropFrame(preview, "item", centredCrop)).toEqual({
    startPercent: 12.5,
    topPercent: 0,
    widthPercent: 75,
    heightPercent: 100,
  });
  expect(cropFrame(preview, "cover", { ...centredCrop, zoomPercent: 200 })).toEqual({
    startPercent: 25,
    topPercent: 25,
    widthPercent: 50,
    heightPercent: 50,
  });
  expect(cropFrame(preview, "logo", { ...centredCrop, focalX: 0 })).toEqual({
    startPercent: 0,
    topPercent: 0,
    widthPercent: 56.25,
    heightPercent: 100,
  });
});
