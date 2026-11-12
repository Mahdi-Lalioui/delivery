import type { TransactionSql } from "postgres";
import { menuItemIsOrderable } from "./menu-item-queries.js";
import { attachedOptionTexts, hasPublicMenuText } from "./public-restaurant-items.js";

type Candidate = Parameters<typeof hasPublicMenuText>[0] & { merchantId: string };

export async function readVegetarianMerchants(
  sql: TransactionSql,
  at: Date,
  merchantIds: string[] | null = null,
) {
  const rows = await sql<Candidate[]>`
    SELECT item.merchant_id AS "merchantId", item.names, item.descriptions,
      item.moderation_status AS "moderationStatus", ${attachedOptionTexts(sql)} AS "optionTexts"
    FROM public.items AS item
    JOIN public.categories AS category
      ON category.merchant_id = item.merchant_id AND category.id = item.category_id
    JOIN public.merchants AS merchant ON merchant.id = item.merchant_id
    WHERE merchant.status = 'active' AND NOT merchant.is_demo
      AND (${merchantIds}::uuid[] IS NULL OR item.merchant_id = ANY(${merchantIds}::uuid[]))
      AND item.archived_at IS NULL AND item.moderation_status IN ('approved', 'unreviewed')
      AND item.tags @> ARRAY['vegetarian'] AND ${menuItemIsOrderable(sql, at)}
      AND NOT EXISTS (
        SELECT FROM public.item_option_groups AS attached
        JOIN public.option_groups AS choice
          ON choice.merchant_id = attached.merchant_id AND choice.id = attached.group_id
        WHERE attached.merchant_id = item.merchant_id AND attached.item_id = item.id
          AND choice.minimum > (
            SELECT count(*) FROM public.options AS option
            WHERE option.merchant_id = choice.merchant_id AND option.group_id = choice.id
              AND option.is_available
          )
      )
  `;
  return new Set(rows.filter(hasPublicMenuText).map(({ merchantId }) => merchantId));
}
