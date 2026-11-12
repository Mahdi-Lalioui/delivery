import {
  readReviewCursor,
  type merchantReviewPageQuery,
  type publicReviewPageOutput,
  type merchantReviewPageOutput,
} from "@zaafran/contracts/ratings";
import type { TransactionSql } from "postgres";
import { readMenuContext, type MenuScope } from "./menu-access.js";
import { activeStandardSession } from "./standard-session.js";

type Query = ReturnType<typeof merchantReviewPageQuery.parse>;
type Page = ReturnType<typeof publicReviewPageOutput.parse>;
type ReviewRow = ReturnType<typeof merchantReviewPageOutput.parse>["reviews"][number];

async function listReviews(
  sql: TransactionSql,
  merchantId: string,
  { limit, cursor, stars }: Query,
) {
  const after = cursor === undefined ? undefined : readReviewCursor(cursor);
  const rows = await sql<ReviewRow[]>`
    SELECT rating.id AS "ratingId", rating.food_stars AS "foodStars",
      rating.delivery_stars AS "deliveryStars", rating.comment,
      to_char(rating.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",
      CASE WHEN reply.rating_id IS NOT NULL THEN jsonb_build_object(
        'body', reply.body,
        'createdAt', to_char(reply.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'editableUntil', to_char((reply.created_at + interval '24 hours') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) END AS reply
    FROM public.orders AS orders
    JOIN public.ratings AS rating ON rating.order_id = orders.id
    LEFT JOIN public.rating_replies AS reply ON reply.rating_id = rating.id
    WHERE orders.merchant_id = ${merchantId} AND orders.status IN ('delivered', 'collected')
    ${stars === undefined ? sql`` : sql`AND rating.food_stars = ${stars}`}
    ${after ? sql`AND (rating.created_at, rating.id) < (${after.createdAt}::timestamptz, ${after.ratingId}::uuid)` : sql``}
    ORDER BY rating.created_at DESC, rating.id DESC LIMIT ${limit + 1}
  `;
  const reviews = rows.slice(0, limit);
  const last = reviews.at(-1);
  return {
    reviews,
    nextCursor: rows.length > limit && last ? `${last.createdAt}~${last.ratingId}` : null,
  };
}

export async function readPublicReviews(
  sql: TransactionSql,
  { slug, ...query }: Omit<Query, "stars"> & { slug: string },
) {
  const [merchant] = await sql<{ id: string }[]>`
    SELECT id FROM public.merchants WHERE slug = ${slug} AND status = 'active' AND NOT is_demo
  `;
  if (!merchant) return undefined;
  const page = await listReviews(sql, merchant.id, query);
  return {
    nextCursor: page.nextCursor,
    reviews: page.reviews.map(({ reply, ...review }) => ({
      ...review,
      reply: reply === null ? null : { body: reply.body, createdAt: reply.createdAt },
    })),
  } satisfies Page;
}

export async function readMerchantReviews(
  sql: TransactionSql,
  query: Query & MenuScope & { sessionId: string },
) {
  const [session] = await sql`
    SELECT WHERE ${activeStandardSession(sql, { userId: query.accountId, sessionId: query.sessionId })}
  `;
  if (!session || !(await readMenuContext(sql, query))) return undefined;
  return listReviews(sql, query.merchantId, query);
}
