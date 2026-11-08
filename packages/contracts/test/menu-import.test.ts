import { expect, test } from "vitest";
import {
  menuImportApplyOutput,
  menuImportApplyInput,
  menuImportColumns,
  menuImportInput,
  menuImportPreviewOutput,
} from "../src/menu-import.ts";

const sessionId = "01932f18-3150-7c33-8a7a-53acfd343201";
const row = {
  external_key: "plat-001",
  category_fr: "Plats",
  name_fr: "Chorba fictive",
  price_dzd: "450",
};

test("[MER-12:contract] the template publishes the exact column order", () => {
  expect(menuImportColumns).toEqual([
    "external_key",
    "category_ar",
    "category_fr",
    "name_ar",
    "name_fr",
    "name_en",
    "description_ar",
    "description_fr",
    "description_en",
    "price_dzd",
  ]);
});

test("[MER-12:contract] rows are raw template cells so the server can report each field", () => {
  const input = {
    rows: [row, { ...row, external_key: "", price_dzd: "abc" }],
    expectedRevision: 3,
  };
  expect(menuImportInput.parse(input)).toEqual(input);
  for (const invalid of [
    { rows: [], expectedRevision: 3 },
    { rows: [{ ...row, photo: "x" }], expectedRevision: 3 },
    { rows: [{ ...row, price_dzd: 450 }], expectedRevision: 3 },
    { rows: [{ ...row, name_fr: "x".repeat(2001) }], expectedRevision: 3 },
    { rows: [row], expectedRevision: -1 },
    { rows: [row] },
    { rows: [row], expectedRevision: 3, merchantId: sessionId },
  ]) {
    expect(menuImportInput.safeParse(invalid).success).toBe(false);
  }
});

test("[MER-12:contract] an import is bounded to 500 rows", () => {
  const rows = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ ...row, external_key: `k${String(index)}` }));
  expect(menuImportInput.safeParse({ rows: rows(500), expectedRevision: 0 }).success).toBe(true);
  expect(menuImportInput.safeParse({ rows: rows(501), expectedRevision: 0 }).success).toBe(false);
});

test("[MER-12:contract] the preview reports one-based rows, template fields and stable reasons", () => {
  const preview = {
    sessionId,
    revision: 3,
    previewToken: null,
    errors: [
      { row: 2, field: "external_key", reason: "required" },
      { row: 2, field: "price_dzd", reason: "invalid_price" },
      { row: 3, field: "external_key", reason: "duplicate_key" },
    ],
    summary: { categoriesCreated: 1, itemsCreated: 1, itemsUpdated: 0, itemsUnchanged: 0 },
  };
  expect(menuImportPreviewOutput.parse(preview)).toEqual(preview);
  for (const error of [
    { row: 0, field: "price_dzd", reason: "invalid_price" },
    { row: 2, field: "photo", reason: "required" },
    { row: 2, field: "price_dzd", reason: "too_cheap" },
  ]) {
    expect(menuImportPreviewOutput.safeParse({ ...preview, errors: [error] }).success).toBe(false);
  }
});

test("[MER-12:contract] apply reports counts and the new revision", () => {
  const applied = {
    revision: 4,
    summary: { categoriesCreated: 0, itemsCreated: 2, itemsUpdated: 1, itemsUnchanged: 5 },
  };
  expect(menuImportApplyOutput.parse(applied)).toEqual(applied);
  expect(
    menuImportApplyOutput.safeParse({
      ...applied,
      summary: { ...applied.summary, itemsCreated: -1 },
    }).success,
  ).toBe(false);
});

test("[MER-12:contract] apply requires the server's preview token", () => {
  const batch = { rows: [row], expectedRevision: 3 };
  expect(menuImportApplyInput.safeParse(batch).success).toBe(false);
  expect(menuImportApplyInput.safeParse({ ...batch, previewToken: "A".repeat(43) }).success).toBe(
    true,
  );
  expect(menuImportApplyInput.safeParse({ ...batch, previewToken: "changed" }).success).toBe(false);
});

test("[MER-12:contract] preview reports persisted category and key conflicts", () => {
  for (const [field, reason] of [
    ["category_fr", "ambiguous_category"],
    ["external_key", "archived_key"],
    ["category_fr", "category_limit"],
  ] as const) {
    expect(
      menuImportPreviewOutput.safeParse({
        sessionId,
        revision: 3,
        errors: [{ row: 2, field, reason }],
        summary: { categoriesCreated: 0, itemsCreated: 0, itemsUpdated: 0, itemsUnchanged: 0 },
        previewToken: null,
      }).success,
    ).toBe(true);
  }
});

test("[MER-12:contract] a row accepts exactly the template columns", () => {
  const full = Object.fromEntries(menuImportColumns.map((column) => [column, "x"]));
  expect(menuImportInput.safeParse({ rows: [full], expectedRevision: 0 }).success).toBe(true);
  for (const column of menuImportColumns) {
    const partial = Object.fromEntries(Object.entries(full).filter(([key]) => key !== column));
    expect(menuImportInput.safeParse({ rows: [partial], expectedRevision: 0 }).success).toBe(true);
  }
});
