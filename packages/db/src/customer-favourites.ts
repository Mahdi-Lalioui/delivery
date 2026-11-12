import type { customerFavouritesOutput } from "@zaafran/contracts/retention";
import type { TransactionSql } from "postgres";
import { lockOrderingCustomer } from "./order-quotes.js";
import { isActiveCustomer, type CustomerOrderScope } from "./order-receipts.js";

type Page = ReturnType<typeof customerFavouritesOutput.parse>;
type Scope = CustomerOrderScope & { now: Date };
type Change = Scope & { merchantId: string; isFavourite: boolean };
const favouriteLimit = 100;

export async function listCustomerFavourites(
  sql: TransactionSql,
  scope: Scope,
): Promise<Page | undefined> {
  if (!(await isActiveCustomer(sql, scope))) return undefined;
  const restaurants = await sql<Page["restaurants"]>`
    SELECT merchant.id AS "merchantId", merchant.restaurant_name AS name, merchant.slug,
      cover.id AS "coverMediaId",
      public.feed_merchant_open(merchant.id, ${scope.now.toISOString()}, merchant.hours_paused_until) AS "isOpen"
    FROM public.customer_favourites AS favourite
    JOIN public.merchants AS merchant ON merchant.id = favourite.merchant_id
      AND merchant.status = 'active' AND NOT merchant.is_demo
    LEFT JOIN public.media_uploads AS cover ON cover.id = merchant.cover_photo_id
      AND cover.merchant_id = merchant.id AND cover.kind = 'cover' AND cover.status = 'ready'
    WHERE favourite.customer_id = ${scope.customerId}
    ORDER BY favourite.created_at DESC, merchant.id DESC
    LIMIT ${favouriteLimit}
  `;
  return { restaurants };
}

export async function changeCustomerFavourite(sql: TransactionSql, change: Change) {
  const { customerId, merchantId, isFavourite, now } = change;
  if (!(await lockOrderingCustomer(sql, customerId)) || !(await isActiveCustomer(sql, change)))
    return "unauthenticated";
  if (!isFavourite) {
    await sql`DELETE FROM public.customer_favourites WHERE customer_id = ${customerId} AND merchant_id = ${merchantId}`;
    return "saved";
  }
  const [merchant] = await sql`
    SELECT id FROM public.merchants WHERE id = ${merchantId} AND status = 'active' AND NOT is_demo
  `;
  if (!merchant) return "not_found";
  const [row] = await sql<{ existing: boolean; total: number }[]>`
    SELECT coalesce(bool_or(favourite.merchant_id = ${merchantId}), false) AS existing,
      count(*)::int AS total
    FROM public.customer_favourites AS favourite
    JOIN public.merchants AS merchant ON merchant.id = favourite.merchant_id
    WHERE favourite.customer_id = ${customerId} AND merchant.status = 'active' AND NOT merchant.is_demo
  `;
  if (row?.existing) return "saved";
  if (row && row.total >= favouriteLimit) return "favourite_limit";
  await sql`
    INSERT INTO public.customer_favourites (customer_id, merchant_id, created_at)
    VALUES (${customerId}, ${merchantId}, ${now.toISOString()}) ON CONFLICT DO NOTHING
  `;
  return "saved";
}
