import { menuCategoryInput, menuItemInput } from "@zaafran/contracts/menu";
import type { menuImportInput, menuImportPreviewOutput } from "@zaafran/contracts/menu-import";
import type { z } from "zod";

type RawRow = z.infer<typeof menuImportInput>["rows"][number];
type RowError = z.infer<typeof menuImportPreviewOutput>["errors"][number];
type Field = RowError["field"];
type LocalizedText = z.infer<typeof menuItemInput>["names"];

export interface ValidatedMenuImportRow {
  readonly row: number;
  readonly externalKey: string;
  readonly categoryNames: LocalizedText;
  readonly names: LocalizedText;
  readonly descriptions: LocalizedText;
  readonly priceDzd: number;
}

interface RowReader {
  text(field: Field): string | undefined;
  report(field: Field, reason: RowError["reason"]): void;
}

interface LocalizedFields {
  ar: Field;
  fr: Field;
  en?: Field;
}

const externalKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const locales = ["ar", "fr", "en"] as const;
const categoryFields = { ar: "category_ar", fr: "category_fr" } satisfies LocalizedFields;
const nameFields = { ar: "name_ar", fr: "name_fr", en: "name_en" } satisfies LocalizedFields;
const descriptionFields = {
  ar: "description_ar",
  fr: "description_fr",
  en: "description_en",
} satisfies LocalizedFields;

const categoryText = menuCategoryInput.shape.names.shape.ar.unwrap();
const itemNameText = menuItemInput.shape.names.shape.ar.unwrap();
const itemDescriptionText = menuItemInput.shape.descriptions.shape.ar.unwrap();

function externalKeyError(
  key: string | undefined,
  seen: Set<string>,
): RowError["reason"] | undefined {
  if (key === undefined) return "required";
  if (key.length > 80) return "too_long";
  if (!externalKeyPattern.test(key)) return "invalid_key";
  if (seen.has(key)) return "duplicate_key";
  return undefined;
}

function readExternalKey(reader: RowReader, seen: Set<string>): string | undefined {
  const key = reader.text("external_key");
  const reason = externalKeyError(key, seen);
  if (reason !== undefined) reader.report("external_key", reason);
  if (reason !== undefined || key === undefined) return undefined;
  seen.add(key);
  return key;
}

function readLocalized(
  reader: RowReader,
  fields: LocalizedFields,
  schema: z.ZodType<string>,
): LocalizedText {
  if (reader.text(fields.ar) === undefined && reader.text(fields.fr) === undefined) {
    reader.report(fields.ar, "required");
  }

  const text: LocalizedText = {};
  for (const locale of locales) {
    const field = fields[locale];
    if (field === undefined) continue;
    const value = reader.text(field);
    if (value === undefined) continue;

    const result = schema.safeParse(value);
    if (result.success) {
      text[locale] = result.data;
    } else {
      const tooLong = result.error.issues.some(({ code }) => code === "too_big");
      reader.report(field, tooLong ? "too_long" : "invalid_text");
    }
  }
  return text;
}

function readPriceDzd(reader: RowReader): number | undefined {
  const field = "price_dzd";
  const value = reader.text(field);
  if (value === undefined) {
    reader.report(field, "required");
    return undefined;
  }

  const digits = value.replace(/[٠-٩۰-۹]/gu, (digit) => {
    const zero = digit <= "٩" ? "٠" : "۰";
    return String(digit.charCodeAt(0) - zero.charCodeAt(0));
  });
  if (/^[0-9]+$/u.test(digits)) {
    const price = menuItemInput.shape.priceDzd.safeParse(Number(digits));
    if (price.success) return price.data;
  }
  reader.report(field, "invalid_price");
  return undefined;
}

export function validateMenuImportRows(rawRows: readonly RawRow[]): {
  rows: ValidatedMenuImportRow[];
  errors: RowError[];
} {
  const rows: ValidatedMenuImportRow[] = [];
  const errors: RowError[] = [];
  const seenKeys = new Set<string>();

  for (const [index, raw] of rawRows.entries()) {
    const row = index + 2;
    const errorCount = errors.length;
    const reader: RowReader = {
      text: (field) => raw[field]?.trim() || undefined,
      report: (field, reason) => {
        errors.push({ row, field, reason });
      },
    };

    const externalKey = readExternalKey(reader, seenKeys);
    const categoryNames = readLocalized(reader, categoryFields, categoryText);
    const names = readLocalized(reader, nameFields, itemNameText);
    const descriptions = readLocalized(reader, descriptionFields, itemDescriptionText);
    const priceDzd = readPriceDzd(reader);

    if (errors.length === errorCount && externalKey !== undefined && priceDzd !== undefined) {
      rows.push({ row, externalKey, categoryNames, names, descriptions, priceDzd });
    }
  }
  return { rows, errors };
}
