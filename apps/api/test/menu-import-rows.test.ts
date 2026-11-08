import { expect, test } from "vitest";
import { validateMenuImportRows } from "../src/menu-import-rows.js";

const validRow = {
  external_key: "plate-001",
  category_fr: "Plats",
  name_ar: "طبق تجريبي",
  description_fr: "Description fictive",
  price_dzd: "450",
};

test("[MER-12] canonicalizes text, localized digits and case-sensitive keys", () => {
  expect(
    validateMenuImportRows([
      {
        ...validRow,
        external_key: "  Dish.01-az_1  ",
        category_ar: "  أطباق ",
        name_en: "  Fictional plate  ",
        name_fr: " ",
        description_en: " Fictional description ",
        price_dzd: " ٢۱۴٧٤۸٣۶٤٧ ",
      },
      { ...validRow, external_key: "dish.01-az_1", price_dzd: " ٠۰0 " },
    ]),
  ).toEqual({
    rows: [
      {
        row: 2,
        externalKey: "Dish.01-az_1",
        categoryNames: { ar: "أطباق", fr: "Plats" },
        names: { ar: "طبق تجريبي", en: "Fictional plate" },
        descriptions: { fr: "Description fictive", en: "Fictional description" },
        priceDzd: 2_147_483_647,
      },
      {
        row: 3,
        externalKey: "dish.01-az_1",
        categoryNames: { fr: "Plats" },
        names: { ar: "طبق تجريبي" },
        descriptions: { fr: "Description fictive" },
        priceDzd: 0,
      },
    ],
    errors: [],
  });
});

test("[MER-12] preserves blank sheet rows and reports missing Arabic or French text", () => {
  const { rows, errors } = validateMenuImportRows([
    validRow,
    {},
    {
      external_key: "plate-002",
      name_en: "Fictional",
      description_en: "Fictional",
      price_dzd: "7",
    },
    { ...validRow, external_key: "plate-003" },
  ]);
  expect(rows.map(({ row }) => row)).toEqual([2, 5]);
  expect(errors).toEqual([
    { row: 3, field: "external_key", reason: "required" },
    { row: 3, field: "category_ar", reason: "required" },
    { row: 3, field: "name_ar", reason: "required" },
    { row: 3, field: "description_ar", reason: "required" },
    { row: 3, field: "price_dzd", reason: "required" },
    { row: 4, field: "category_ar", reason: "required" },
    { row: 4, field: "name_ar", reason: "required" },
    { row: 4, field: "description_ar", reason: "required" },
  ]);
});

test("[MER-12] reports field reasons in template order and uses the menu text limits", () => {
  const { rows, errors } = validateMenuImportRows([
    {
      ...validRow,
      external_key: "/plate",
      category_fr: "c".repeat(121),
      name_en: "invalid\0text",
      description_fr: "d".repeat(1001),
      description_en: "invalid\uD800text",
      price_dzd: "1.5",
    },
    {
      ...validRow,
      external_key: "a".repeat(80),
      category_fr: "c".repeat(120),
      name_fr: "🍲".repeat(60),
      description_fr: "d".repeat(1000),
    },
    { ...validRow, external_key: "a".repeat(81) },
  ]);
  expect(rows.map(({ row }) => row)).toEqual([3]);
  expect(errors).toEqual([
    { row: 2, field: "external_key", reason: "invalid_key" },
    { row: 2, field: "category_fr", reason: "too_long" },
    { row: 2, field: "name_en", reason: "invalid_text" },
    { row: 2, field: "description_fr", reason: "too_long" },
    { row: 2, field: "description_en", reason: "invalid_text" },
    { row: 2, field: "price_dzd", reason: "invalid_price" },
    { row: 4, field: "external_key", reason: "too_long" },
  ]);
});

test("[MER-12] reports subsequent duplicate keys even when the first row has another error", () => {
  const { rows, errors } = validateMenuImportRows([
    { ...validRow, external_key: " Meal-01 ", price_dzd: "unknown" },
    { ...validRow, external_key: "Meal-01" },
    { ...validRow, external_key: "Meal-01 " },
    { ...validRow, external_key: "meal-01" },
  ]);
  expect(rows.map(({ row }) => row)).toEqual([5]);
  expect(errors).toEqual([
    { row: 2, field: "price_dzd", reason: "invalid_price" },
    { row: 3, field: "external_key", reason: "duplicate_key" },
    { row: 4, field: "external_key", reason: "duplicate_key" },
  ]);
});

test.each(["+1", "-0", "12.0", "١٬٠٠٠", "1e2", "0x10", "2147483648", "9".repeat(120)])(
  "[MER-12] rejects inexact or out-of-range DZD cell %s",
  (price_dzd) => {
    expect(validateMenuImportRows([{ ...validRow, price_dzd }])).toEqual({
      rows: [],
      errors: [{ row: 2, field: "price_dzd", reason: "invalid_price" }],
    });
  },
);
