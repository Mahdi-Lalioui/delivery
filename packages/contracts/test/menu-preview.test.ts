import { expect, test } from "vitest";
import { menuPreviewOutput } from "../src/menu-preview.ts";

const categoryId = "01932f18-3150-7c33-8a7a-53acfd343002";
const itemId = "01932f18-3150-7c33-8a7a-53acfd343003";
const item = {
  itemId,
  names: { fr: "Couscous fictif" },
  descriptions: { ar: "وصف تجريبي" },
  priceDzd: 650,
  tags: ["spicy"],
  isAvailable: true,
  soldOutUntil: null,
  photo: null,
};
const preview = {
  revision: 3,
  restaurantName: "Restaurant fictif",
  categories: [{ categoryId, names: { fr: "Plats" }, items: [item] }],
};

test("[ADM-04:contract] the preview carries only customer-facing item fields", () => {
  expect(menuPreviewOutput.parse(preview)).toEqual(preview);
  const withStatus = { ...item, moderationStatus: "approved" };
  const leaked = { ...preview, categories: [{ ...preview.categories[0], items: [withStatus] }] };
  expect(menuPreviewOutput.safeParse(leaked).success).toBe(false);
});

test("[ADM-04:contract] the preview rejects fractional prices and contradictory availability", () => {
  const withItem = (changes: object) => ({
    ...preview,
    categories: [{ categoryId, names: { fr: "Plats" }, items: [{ ...item, ...changes }] }],
  });
  expect(menuPreviewOutput.safeParse(withItem({ priceDzd: 650.5 })).success).toBe(false);
  const contradictory = withItem({ soldOutUntil: "2026-11-08T23:00:00.000Z" });
  expect(menuPreviewOutput.safeParse(contradictory).success).toBe(false);
  const soldOut = withItem({ isAvailable: false, soldOutUntil: "2026-11-08T23:00:00.000Z" });
  expect(menuPreviewOutput.safeParse(soldOut).success).toBe(true);
});

const variants = (["avif", "webp"] as const).flatMap((format) =>
  [160, 320, 640, 960, 1280].map((width) => ({
    format,
    width,
    height: (width * 3) / 4,
    bytes: 512,
    url: `/media/${itemId}/${width.toString()}.${format}`,
  })),
);
const photo = { thumbhash: "1QcSHQRnh493V4dIh4eXh1h4kJUI", variants };

test("[MER-14:contract] a preview item photo carries every public variant and its ThumbHash", () => {
  const withPhoto = (value: object) => ({
    ...preview,
    categories: [{ categoryId, names: { fr: "Plats" }, items: [{ ...item, photo: value }] }],
  });
  expect(menuPreviewOutput.parse(withPhoto(photo))).toEqual(withPhoto(photo));
  const missing = { ...photo, variants: variants.slice(1) };
  expect(menuPreviewOutput.safeParse(withPhoto(missing)).success).toBe(false);
  for (const url of ["https://cdn.invalid/a.webp", "/media/../quarantine/a", "/quarantine/a"]) {
    const [first, ...rest] = variants;
    const moved = { ...photo, variants: [{ ...first, url }, ...rest] };
    expect(menuPreviewOutput.safeParse(withPhoto(moved)).success).toBe(false);
  }
});
