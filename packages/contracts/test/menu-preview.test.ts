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
