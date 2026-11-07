import { expect, test } from "vitest";
import {
  menuCategoryInput,
  menuCategoryOrderInput,
  menuItemInput,
  menuOptionGroupInput,
} from "../src/menu.ts";

const categoryId = "01932f18-3150-7c33-8a7a-53acfd343001";
const groupId = "01932f18-3150-7c33-8a7a-53acfd343002";
const otherId = "01932f18-3150-7c33-8a7a-53acfd343003";
const names = { ar: "الأطباق", fr: "Plats", en: "Dishes" };
const category = { names, availability: { from: "18:00", to: "02:00" } };
const item = {
  categoryId,
  names: { fr: "Plat fictif" },
  descriptions: { ar: "وصف تجريبي" },
  priceDzd: 590,
  photoId: null,
  tags: ["vegetarian", "new"],
  extraPrepMinutes: 5,
  optionGroupIds: [groupId, otherId],
};
const option = { names: { fr: "Sauce" }, priceDeltaDzd: 0, isDefault: true, isAvailable: true };
const group = { names, minimum: 0, maximum: 2, options: [option, { ...option, isDefault: false }] };

test("[MER-09:contract] accepts localized category names and an overnight or unbounded window", () => {
  expect(menuCategoryInput.parse(category)).toEqual(category);
  expect(menuCategoryInput.parse({ names: { ar: "  الأطباق  " }, availability: null })).toEqual({
    names: { ar: "الأطباق" },
    availability: null,
  });
  for (const input of [
    { ...category, merchantId: groupId },
    { ...category, names: { en: "Only English" } },
    { ...category, names: { ar: " " } },
    { ...category, availability: { from: "24:00", to: "02:00" } },
    { ...category, availability: { from: "18:00", to: "18:00" } },
  ]) {
    expect(menuCategoryInput.safeParse(input).success).toBe(false);
  }
});

test("[MER-09:contract] reorders each category once with the expected revision", () => {
  const order = { categoryIds: [otherId, categoryId], expectedRevision: 6 };
  expect(menuCategoryOrderInput.parse(order)).toEqual(order);
  for (const input of [
    { ...order, categoryIds: [categoryId, categoryId.toUpperCase()] },
    { ...order, categoryIds: ["not-an-id"] },
    { ...order, categoryIds: [] },
    { ...order, expectedRevision: -1 },
    { ...order, expectedRevision: 0.5 },
  ]) {
    expect(menuCategoryOrderInput.safeParse(input).success).toBe(false);
  }
});

test("[MER-09:contract] preserves integer DZD and the ordered item-to-group list", () => {
  expect(menuItemInput.parse(item)).toEqual(item);
  for (const input of [
    { ...item, descriptions: { en: "Only English" } },
    { ...item, priceDzd: "590" },
    { ...item, priceDzd: 590.5 },
    { ...item, priceDzd: -1 },
    { ...item, priceDzd: 2_147_483_648 },
    { ...item, tags: ["new", "new"] },
    { ...item, tags: ["unknown"] },
    { ...item, extraPrepMinutes: -1 },
    { ...item, optionGroupIds: [groupId, groupId.toUpperCase()] },
    { ...item, photoId: "not-an-id" },
    { ...item, moderationStatus: "approved" },
  ]) {
    expect(menuItemInput.safeParse(input).success).toBe(false);
  }
});

test("[MER-10:contract] validates option cardinality, defaults and integer nonnegative deltas", () => {
  expect(menuOptionGroupInput.parse(group)).toEqual(group);
  const soldOutDefault = { ...group, options: [{ ...option, isAvailable: false }, option] };
  expect(menuOptionGroupInput.parse(soldOutDefault)).toEqual(soldOutDefault);
  for (const input of [
    { ...group, minimum: 3 },
    { ...group, maximum: 3 },
    { ...group, maximum: 0 },
    { ...group, maximum: 1, options: [option, option] },
    { ...group, options: [{ ...option, priceDeltaDzd: -1 }, option] },
    { ...group, options: [{ ...option, priceDeltaDzd: 2.5 }, option] },
    { ...group, options: [] },
  ]) {
    expect(menuOptionGroupInput.safeParse(input).success).toBe(false);
  }
});
