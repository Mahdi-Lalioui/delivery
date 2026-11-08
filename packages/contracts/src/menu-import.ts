import { z } from "zod";

/** MER-12: the template's columns, in the order the downloadable template lists them. */
export const menuImportColumns = [
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
] as const;

const uuid = z.uuid();
const menuRevision = z.int().nonnegative();
// Raw cells: the server validates each one so the report can name the row and field (D-016).
const cell = z.string().max(2000).optional();

const menuImportRow = z.strictObject({
  external_key: cell,
  category_ar: cell,
  category_fr: cell,
  name_ar: cell,
  name_fr: cell,
  name_en: cell,
  description_ar: cell,
  description_fr: cell,
  description_en: cell,
  price_dzd: cell,
});

export const menuImportInput = z.strictObject({
  rows: z.array(menuImportRow).min(1).max(500),
  expectedRevision: menuRevision,
});

const previewToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const menuImportApplyInput = menuImportInput.extend({ previewToken });

const menuImportErrorReason = z.enum([
  "required",
  "too_long",
  "invalid_text",
  "invalid_key",
  "duplicate_key",
  "invalid_price",
  "archived_key",
  "ambiguous_category",
  "category_limit",
]);

const importError = z.strictObject({
  // One-based, counting the header as row 1, so it matches the row number a spreadsheet shows.
  row: z.int().min(2).max(501),
  field: z.enum(menuImportColumns),
  reason: menuImportErrorReason,
});

const count = z.int().min(0).max(500);
const importSummary = z.strictObject({
  categoriesCreated: count,
  itemsCreated: count,
  itemsUpdated: count,
  itemsUnchanged: count,
});

export const menuImportPreviewOutput = z
  .strictObject({
    sessionId: uuid,
    revision: menuRevision,
    errors: z.array(importError).max(5000),
    summary: importSummary,
    previewToken: previewToken.nullable(),
  })
  .refine(({ errors, previewToken }) => (errors.length === 0) === (previewToken !== null));

export const menuImportApplyOutput = z.strictObject({
  revision: menuRevision,
  summary: importSummary,
});
