import { expect, test } from "vitest";
import { isPreviewDemo, previewApiDestination } from "../src/preview-settings.ts";

test("team demo is opt-in and never active in Vercel production", () => {
  expect(isPreviewDemo({})).toBe(false);
  expect(isPreviewDemo({ ZAAFRAN_PREVIEW_DEMO: "1" })).toBe(false);
  expect(isPreviewDemo({ ZAAFRAN_PREVIEW_DEMO: "1", VERCEL_ENV: "preview" })).toBe(true);
  expect(isPreviewDemo({ ZAAFRAN_PREVIEW_DEMO: "1", VERCEL_ENV: "production" })).toBe(false);
});

test("API rewrites use an explicit trusted HTTPS origin without mixed demo traffic", () => {
  expect(previewApiDestination({ ZAAFRAN_API_ORIGIN: "https://api.example.test" })).toBe(
    "https://api.example.test/v1/:path*",
  );
  for (const origin of [
    "http://api.example.test",
    "https://user@api.example.test",
    "https://api.example.test/path",
  ]) {
    expect(() => previewApiDestination({ ZAAFRAN_API_ORIGIN: origin })).toThrow();
  }
  expect(() =>
    previewApiDestination({
      ZAAFRAN_API_ORIGIN: "https://api.example.test",
      ZAAFRAN_PREVIEW_DEMO: "1",
      VERCEL_ENV: "preview",
    }),
  ).toThrow();
});
