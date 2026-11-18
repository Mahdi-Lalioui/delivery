# Photo pipeline verification

Verified on 18 November 2026 at lane-a commit `4a106b7`.

- `pnpm exec vitest run --coverage.enabled=false packages/media/test/photo-crop.test.ts` — passed, 11 tests. Coverage includes codec variants, crop focal points, metadata removal and the colour-grade bounds for item, cover and logo photos.
- `pnpm --filter @zaafran/media typecheck` — passed.
- `packages/media/src/photo-crop.ts` applies the shared food grade to item and cover images; logos are cropped without the food grade. [Implementation](../../../packages/media/src/photo-crop.ts) · [Style](../../../packages/media/src/photo-style.ts) · [Restaurant photo guide](../../RESTAURANT_PHOTOS.md)

These checks prove the transform and its scope; they do not claim that every existing source image has been individually judged by a human.
