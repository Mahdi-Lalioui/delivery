// Plain media constants with no schema code, so browser pages can read them without zod.

export const photoUploadMaximumBytes = 8 * 1024 * 1024;
export const photoVariantWidths = [160, 320, 640, 960, 1280] as const;
export const photoRatios = {
  application: { width: 16, height: 9 },
  cover: { width: 16, height: 9 },
  item: { width: 4, height: 3 },
  logo: { width: 1, height: 1 },
  delivery_proof: { width: 16, height: 9 },
} as const;
