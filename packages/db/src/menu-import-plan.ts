import type { TransactionSql } from "postgres";
import type {
  ImportCategory,
  ImportTranslations,
  MenuImportError,
  MenuImportPlan,
  PlannedImportItem,
  ValidatedMenuImportRow,
} from "./menu-import-types.js";

interface ExistingCategory {
  readonly id: string;
  readonly names: ImportTranslations;
  readonly sort: number;
}

interface ExistingItem {
  readonly id: string;
  readonly externalKey: string;
  readonly categoryId: string;
  readonly names: ImportTranslations;
  readonly descriptions: ImportTranslations;
  readonly priceDzd: number;
  readonly archived: boolean;
}

function normalizeCategory(names: ImportTranslations): ImportTranslations {
  const ar = names.ar?.trim().normalize("NFC");
  const fr = names.fr?.trim().normalize("NFC");
  return { ...(ar ? { ar } : {}), ...(fr ? { fr } : {}) };
}

function categoryKey(names: ImportTranslations): string {
  const normalized = normalizeCategory(names);
  return JSON.stringify([normalized.ar ?? null, normalized.fr ?? null]);
}

function equalText(left: ImportTranslations, right: ImportTranslations): boolean {
  return left.ar === right.ar && left.fr === right.fr && left.en === right.en;
}

function resolveCategories(existing: readonly ExistingCategory[]) {
  const byNames = new Map<string, ImportCategory[]>();
  for (const category of existing) {
    const key = categoryKey(category.names);
    const matches = byNames.get(key) ?? [];
    matches.push(category);
    byNames.set(key, matches);
  }
  return byNames;
}

function hasImportedChanges(
  existing: ExistingItem | undefined,
  category: ImportCategory,
  row: ValidatedMenuImportRow,
): boolean {
  return (
    existing === undefined ||
    existing.categoryId !== category.id ||
    existing.priceDzd !== row.priceDzd ||
    !equalText(existing.names, row.names) ||
    !equalText(existing.descriptions, row.descriptions)
  );
}

function planImport(
  rows: readonly ValidatedMenuImportRow[],
  existingCategories: readonly ExistingCategory[],
  existingItems: readonly ExistingItem[],
): MenuImportPlan {
  const categoriesByNames = resolveCategories(existingCategories);
  const byExternalKey = new Map(existingItems.map((item) => [item.externalKey, item]));
  const categories: ImportCategory[] = [];
  const items: PlannedImportItem[] = [];
  const errors: MenuImportError[] = [];

  for (const row of rows) {
    const existing = byExternalKey.get(row.externalKey);
    if (existing?.archived) {
      errors.push({ row: row.row, field: "external_key", reason: "archived_key" });
      continue;
    }

    const key = categoryKey(row.categoryNames);
    const matches = categoriesByNames.get(key) ?? [];
    if (matches.length > 1) {
      errors.push({ row: row.row, field: "category_ar", reason: "ambiguous_category" });
      continue;
    }

    let category = matches[0];
    if (!category) {
      if (existingCategories.length + categories.length >= 1_000) {
        errors.push({ row: row.row, field: "category_ar", reason: "category_limit" });
        continue;
      }
      category = { id: undefined, names: normalizeCategory(row.categoryNames) };
      categories.push(category);
      categoriesByNames.set(key, [category]);
    }

    const changed = hasImportedChanges(existing, category, row);
    items.push({ row, category, id: existing?.id, changed });
  }

  return {
    categories,
    nextSort: existingCategories.reduce((next, category) => Math.max(next, category.sort + 1), 0),
    items,
    errors,
    summary: {
      categoriesCreated: categories.length,
      itemsCreated: items.filter((item) => item.id === undefined).length,
      itemsUpdated: items.filter((item) => item.id !== undefined && item.changed).length,
      itemsUnchanged: items.filter((item) => !item.changed).length,
    },
  };
}

export async function readImportPlan(
  sql: TransactionSql,
  {
    merchantId,
    rows,
    lock,
  }: {
    readonly merchantId: string;
    readonly rows: readonly ValidatedMenuImportRow[];
    readonly lock: boolean;
  },
): Promise<MenuImportPlan> {
  const categories = await sql<ExistingCategory[]>`
    SELECT id, names, sort FROM public.categories WHERE merchant_id = ${merchantId} ORDER BY sort, id
  `;
  const keys = rows.map((row) => row.externalKey);
  const lockItems = lock ? sql`FOR NO KEY UPDATE` : sql``;
  const items = await sql<ExistingItem[]>`
    SELECT id, external_key AS "externalKey", category_id AS "categoryId", names, descriptions,
      price_dzd AS "priceDzd", archived_at IS NOT NULL AS archived
    FROM public.items WHERE merchant_id = ${merchantId} AND external_key = ANY(${keys}::text[])
    ORDER BY id ${lockItems}
  `;
  return planImport(rows, categories, items);
}
