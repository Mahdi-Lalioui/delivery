import { findProhibitedGoods } from "@zaafran/domain/moderation";
import type { TransactionSql } from "postgres";
import type { DatabaseConnection } from "./database.ts";
import { demoMerchants, type DemoDish, type DemoMerchant } from "./demo-merchants-data.ts";

// A fixed time keeps repeated seeds identical; demo rows never carry a real signup date.
const seededAt = "2026-11-01T09:00:00.000Z";
// D-022: the reserved fictional block for demo restaurant phones.
const phonePrefix = "+2135509999";

/** Inserts the twelve fictional demo restaurants once. Existing demo rows are left untouched. */
export async function seedDemoMerchants({ sql }: DatabaseConnection): Promise<void> {
  await sql.begin(async (transaction) => {
    for (const [index, merchant] of demoMerchants.entries()) {
      const merchantId = await insertMerchant(transaction, merchant, index);
      if (merchantId !== undefined) await insertMenu(transaction, merchantId, merchant);
    }
  });
}

async function insertMerchant(sql: TransactionSql, merchant: DemoMerchant, index: number) {
  const [commune] = await sql<{ id: string }[]>`
    SELECT id FROM public.communes WHERE code = ${merchant.communeCode}
  `;
  if (!commune) throw new Error("Seed the communes before the demo restaurants.");
  const phone = phonePrefix + String(index + 1).padStart(2, "0");
  const [created] = await sql<{ id: string }[]>`
    INSERT INTO public.merchants
      (slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status,
        created_at, reviewed_at, is_demo)
    SELECT ${merchant.slug}, ${merchant.restaurantName}, ${merchant.ownerName}, ${phone},
      commune.id, commune.centroid, ${[...merchant.cuisines]}::text[], 'active',
      ${seededAt}::timestamptz, ${seededAt}::timestamptz, true
    FROM public.communes AS commune
    WHERE commune.id = ${commune.id}
    ON CONFLICT (slug) DO NOTHING
    RETURNING id
  `;
  return created?.id;
}

async function insertMenu(sql: TransactionSql, merchantId: string, { menu }: DemoMerchant) {
  for (const [sort, category] of menu.entries()) {
    const [created] = await sql<{ id: string }[]>`
      INSERT INTO public.categories (merchant_id, names, sort)
      VALUES (${merchantId}, ${JSON.stringify(category.names)}::jsonb, ${sort})
      RETURNING id
    `;
    if (!created) throw new Error("Demo category insert returned no row.");
    for (const dish of category.dishes)
      await insertDish(sql, { merchantId, categoryId: created.id, dish });
  }
}

async function insertDish(
  sql: TransactionSql,
  { merchantId, categoryId, dish }: { merchantId: string; categoryId: string; dish: DemoDish },
) {
  await sql`
    INSERT INTO public.items
      (merchant_id, category_id, names, descriptions, price_dzd, tags, prep_extra_min,
        moderation_status)
    VALUES (${merchantId}, ${categoryId}, ${JSON.stringify(dish.names)}::jsonb,
      ${JSON.stringify(dish.descriptions)}::jsonb, ${dish.priceDzd}, '{}'::text[], 0,
      ${screen(dish)})
  `;
}

// §17.3: demo text goes through the same prohibited-goods screen as merchant writes.
function screen({ names, descriptions }: DemoDish) {
  const texts = [names.ar, names.fr, descriptions.ar, descriptions.fr];
  return findProhibitedGoods(texts).length > 0 ? "blocked_pending_review" : "unreviewed";
}
