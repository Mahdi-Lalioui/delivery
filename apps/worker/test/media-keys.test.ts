import { expect, test } from "vitest";
import { previewStorageKey, variantStorageKey } from "../src/media-keys.ts";

const mediaId = "01932f18-3150-7c33-8a7a-000000000123";

test("[MER-14:worker] the private crop preview never sits under the public media prefix", () => {
  expect(previewStorageKey(mediaId)).toBe(`private/${mediaId}/preview.webp`);
});

test("[MER-14:worker] restaurant variants are public and application variants stay private", () => {
  for (const kind of ["item", "cover", "logo"] as const) {
    expect(variantStorageKey({ mediaId, kind, width: 640, format: "avif" })).toBe(
      `media/${mediaId}/640.avif`,
    );
  }
  expect(variantStorageKey({ mediaId, kind: "application", width: 160, format: "webp" })).toBe(
    `private/${mediaId}/160.webp`,
  );
});
