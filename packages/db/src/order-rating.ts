import type { orderRatingInput, orderRatingOutput } from "@zaafran/contracts/ratings";
import type { ISql, TransactionSql } from "postgres";
import { readRatingReply } from "./merchant-review-commands.js";
import { hash } from "./order-placement-store.js";
import { lockOrderingCustomer } from "./order-quotes.js";
import { isActiveCustomer, type CustomerOrderScope } from "./order-receipts.js";
import { timestampParsers } from "./timestamp-parsers.js";

type Rating = ReturnType<typeof orderRatingOutput.parse>;
type RatingRow = Omit<Rating, "createdAt" | "editableUntil" | "reply"> & { createdAt: Date };
type Scope = CustomerOrderScope & { orderId: string };
type Command = Scope & {
  idempotencyKey: string;
  input: ReturnType<typeof orderRatingInput.parse>;
  now: Date;
};

const dayMs = 86_400_000;
const ratingColumns = (sql: ISql) => sql`
  id AS "ratingId", order_id AS "orderId", food_stars AS "foodStars",
  delivery_stars AS "deliveryStars", comment, created_at AS "createdAt"
`;

function present({ createdAt, ...rating }: RatingRow, reply: Rating["reply"] = null): Rating {
  return {
    ...rating,
    createdAt: createdAt.toISOString(),
    editableUntil: new Date(createdAt.getTime() + dayMs).toISOString(),
    reply,
  };
}

async function presentWithReply(sql: ISql, rating: RatingRow) {
  const reply = await readRatingReply(sql, rating.ratingId);
  return present(rating, reply && { body: reply.body, createdAt: reply.createdAt });
}

export async function readOrderRating(sql: TransactionSql, scope: Scope) {
  if (!(await isActiveCustomer(sql, scope))) return { kind: "not_found" } as const;
  const [order] = await sql<{ rating: RatingRow | null }[]>`
    SELECT (SELECT row_to_json(review) FROM (
      SELECT ${ratingColumns(sql)} FROM public.ratings WHERE order_id = orders.id
    ) AS review) AS rating
    FROM public.orders WHERE id = ${scope.orderId} AND customer_id = ${scope.customerId}
  `;
  if (!order) return { kind: "not_found" } as const;
  if (!order.rating) return { kind: "unrated" } as const;
  const createdAt = new Date(order.rating.createdAt);
  return {
    kind: "rated",
    rating: await presentWithReply(sql, { ...order.rating, createdAt }),
  } as const;
}

export async function readCustomerRatings(sql: ISql, customerId: string): Promise<Rating[]> {
  const rows = await sql<(RatingRow & { reply: Rating["reply"] })[]>`
    SELECT ${ratingColumns(sql)}, (
      SELECT jsonb_build_object('body', body,
        'createdAt', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      FROM public.rating_replies WHERE rating_id = ratings.id
    ) AS reply
    FROM public.ratings WHERE order_id IN (SELECT id FROM public.orders WHERE customer_id = ${customerId})
    ORDER BY created_at DESC, id DESC
  `.parsers(timestampParsers);
  return rows.map(({ reply, ...rating }) => present(rating, reply));
}

async function upsertRating(sql: TransactionSql, { orderId, input, now }: Command) {
  const timestamp = now.toISOString();
  const [row] = await sql<RatingRow[]>`
    INSERT INTO public.ratings AS rating (order_id, food_stars, delivery_stars, comment, created_at)
    VALUES (${orderId}, ${input.foodStars}, ${input.deliveryStars ?? null}, ${input.comment ?? null}, ${timestamp})
    ON CONFLICT (order_id) DO UPDATE SET food_stars = excluded.food_stars,
      delivery_stars = excluded.delivery_stars, comment = excluded.comment
    WHERE rating.created_at > ${timestamp}::timestamptz - interval '24 hours'
    RETURNING ${ratingColumns(sql)}
  `.parsers(timestampParsers);
  return row;
}

function ratingFingerprint(input: Command["input"]) {
  return hash(
    JSON.stringify([input.foodStars, input.deliveryStars ?? null, input.comment ?? null]),
  );
}

export async function saveOrderRating(sql: TransactionSql, command: Command) {
  const { orderId, customerId, now, input, idempotencyKey } = command;
  if (!(await lockOrderingCustomer(sql, customerId)) || !(await isActiveCustomer(sql, command)))
    return { kind: "not_found" } as const;

  const [order] = await sql<{ fulfilment: "delivery" | "pickup"; status: string }[]>`
    SELECT fulfilment, status FROM public.orders WHERE id = ${orderId} AND customer_id = ${customerId}
    FOR UPDATE
  `;
  if (!order) return { kind: "not_found" } as const;
  const timestamp = now.toISOString();
  const keyHash = hash(idempotencyKey);
  const requestHash = ratingFingerprint(input);
  const [receipt] = await sql<{ matches: boolean; rating: Rating }[]>`
    SELECT request_hash = ${requestHash} AS matches, response AS rating FROM public.order_rating_receipts
    WHERE customer_id = ${customerId} AND order_id = ${orderId} AND key_hash = ${keyHash}
      AND expires_at > ${timestamp}
  `;
  if (receipt)
    return receipt.matches
      ? ({ kind: "rated", rating: receipt.rating } as const)
      : ({ kind: "idempotency_conflict" } as const);

  if (order.status !== (order.fulfilment === "delivery" ? "delivered" : "collected"))
    return { kind: "not_eligible" } as const;
  if ((order.fulfilment === "delivery") !== (input.deliveryStars !== undefined))
    return { kind: "invalid_stars" } as const;

  const row = await upsertRating(sql, command);
  if (!row) return { kind: "edit_window_closed" } as const;

  const rating = await presentWithReply(sql, row);
  const expiresAt = new Date(now.getTime() + dayMs).toISOString();
  await sql`
    INSERT INTO public.order_rating_receipts (customer_id, order_id, key_hash, request_hash, response, expires_at)
    VALUES (${customerId}, ${orderId}, ${keyHash}, ${requestHash}, ${JSON.stringify(rating)}::jsonb, ${expiresAt})
    ON CONFLICT (customer_id, order_id, key_hash) DO UPDATE SET request_hash = excluded.request_hash,
      response = excluded.response, expires_at = excluded.expires_at
  `;
  return { kind: "rated", rating } as const;
}

export async function pruneOrderRatingReceipts(sql: ISql, now: Date): Promise<void> {
  await sql`DELETE FROM public.order_rating_receipts WHERE expires_at <= ${now.toISOString()}`;
}
