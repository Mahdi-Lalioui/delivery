import { findProhibitedGoods } from "@zaafran/domain/moderation";
import type { TransactionSql } from "postgres";
import type { ImportCategory, MenuImportPlan, PlannedImportItem } from "./menu-import-types.js";

function screenImportedText({ names, descriptions }: PlannedImportItem["row"]) {
  const texts = [names, descriptions].flatMap(({ ar, fr, en }) => [ar ?? "", fr ?? "", en ?? ""]);
  return findProhibitedGoods(texts).length > 0 ? "blocked_pending_review" : "unreviewed";
}

async function insertCategories(
  sql: TransactionSql,
  merchantId: string,
  plan: MenuImportPlan,
): Promise<Map<ImportCategory, string>> {
  const categories = plan.categories.map(({ names }, index) => ({
    names,
    sort: plan.nextSort + index,
  }));
  const created = await sql<{ id: string; sort: number }[]>`
    INSERT INTO public.categories (merchant_id, names, sort)
    SELECT ${merchantId}, imported.names, imported.sort
    FROM jsonb_to_recordset(${JSON.stringify(categories)}::jsonb) AS imported(names jsonb, sort integer)
    ORDER BY imported.sort
    RETURNING id, sort
  `;
  const ids = new Map<ImportCategory, string>();
  for (const category of created) {
    const planned = plan.categories[category.sort - plan.nextSort];
    if (!planned) throw new Error("Imported category has no matching plan.");
    ids.set(planned, category.id);
  }
  return ids;
}

function itemValues(plan: MenuImportPlan, createdIds: ReadonlyMap<ImportCategory, string>) {
  return plan.items
    .filter((item) => item.changed)
    .map((item, position) => {
      const categoryId = item.category.id ?? createdIds.get(item.category);
      if (!categoryId) throw new Error("Imported item has no resolved category.");
      const { externalKey, names, descriptions, priceDzd } = item.row;
      return {
        category_id: categoryId,
        external_key: externalKey,
        names,
        descriptions,
        price_dzd: priceDzd,
        text_status: screenImportedText(item.row),
        position,
      };
    });
}

export async function writeImportPlan(
  sql: TransactionSql,
  merchantId: string,
  plan: MenuImportPlan,
): Promise<void> {
  const createdIds = await insertCategories(sql, merchantId, plan);
  const items = itemValues(plan, createdIds);
  await sql`
    INSERT INTO public.items AS item
      (merchant_id, category_id, external_key, names, descriptions, price_dzd, tags,
        prep_extra_min, moderation_status)
    SELECT ${merchantId}, imported.category_id, imported.external_key, imported.names,
      imported.descriptions, imported.price_dzd, '{}'::text[], 0, imported.text_status
    FROM jsonb_to_recordset(${JSON.stringify(items)}::jsonb) AS imported(
      category_id uuid, external_key text, names jsonb, descriptions jsonb, price_dzd integer,
      text_status text, position integer
    )
    ORDER BY imported.position
    ON CONFLICT (merchant_id, external_key) DO UPDATE
    SET category_id = excluded.category_id, names = excluded.names,
      descriptions = excluded.descriptions, price_dzd = excluded.price_dzd,
      moderation_status = CASE
        WHEN item.moderation_status IN ('blocked_pending_review', 'rejected') THEN item.moderation_status
        WHEN item.names IS DISTINCT FROM excluded.names
          OR item.descriptions IS DISTINCT FROM excluded.descriptions
          OR item.moderation_status = 'unreviewed'
        THEN excluded.moderation_status ELSE item.moderation_status END
    WHERE item.archived_at IS NULL
  `;
}
