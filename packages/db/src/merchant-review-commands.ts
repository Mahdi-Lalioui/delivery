import { merchantReviewReplyOutput, merchantReviewReportOutput } from "@zaafran/contracts/ratings";
import type { ISql, TransactionSql } from "postgres";
import { lockEditableMenu, type MenuScope } from "./menu-access.js";
import { hash } from "./order-placement-store.js";
import { activeStandardSession } from "./standard-session.js";
import { timestampParsers } from "./timestamp-parsers.js";

type Reply = ReturnType<typeof merchantReviewReplyOutput.parse>;
type Report = ReturnType<typeof merchantReviewReportOutput.parse>;
type Scope = MenuScope & { sessionId: string; ratingId: string; idempotencyKey: string; now: Date };
type ReplyCommand = Scope & { body: string };
type ReportCommand = Scope & { reason: string };
type RatingReplyRow = { body: string; createdAt: Date };
type StoredReceipt = { matches: boolean; response: unknown };

const dayMs = 86_400_000;

async function lockScopedReview(sql: TransactionSql, scope: Scope) {
  const [session] = await sql`
    SELECT WHERE ${activeStandardSession(sql, { userId: scope.accountId, sessionId: scope.sessionId })}
  `;
  if (!session || (await lockEditableMenu(sql, scope, "editor")) === undefined) return false;
  const [row] = await sql`
    SELECT rating.id FROM public.ratings AS rating
    JOIN public.orders AS orders ON orders.id = rating.order_id
    WHERE rating.id = ${scope.ratingId} AND orders.merchant_id = ${scope.merchantId}
      AND orders.status IN ('delivered', 'collected') FOR UPDATE OF rating
  `;
  return row !== undefined;
}

function commandKey(scope: Scope, operation: "reply" | "report", content: string) {
  return { ...scope, operation, keyHash: hash(scope.idempotencyKey), requestHash: hash(content) };
}
type CommandKey = ReturnType<typeof commandKey>;

async function previousReceipt(sql: TransactionSql, key: CommandKey) {
  const [row] = await sql<StoredReceipt[]>`
    SELECT request_hash = ${key.requestHash} AS matches, response FROM public.merchant_review_receipts
    WHERE account_id = ${key.accountId} AND rating_id = ${key.ratingId} AND operation = ${key.operation}
      AND key_hash = ${key.keyHash} AND expires_at > ${key.now.toISOString()}
  `;
  return row;
}

async function writeReceipt(sql: TransactionSql, key: CommandKey, output: Reply | Report) {
  const expiresAt = new Date(key.now.getTime() + dayMs).toISOString();
  await sql`
    INSERT INTO public.merchant_review_receipts
      (account_id, rating_id, operation, key_hash, request_hash, response, expires_at)
    VALUES (${key.accountId}, ${key.ratingId}, ${key.operation}, ${key.keyHash}, ${key.requestHash},
      ${JSON.stringify(output)}::jsonb, ${expiresAt})
    ON CONFLICT (account_id, rating_id, operation, key_hash) DO UPDATE
    SET request_hash = excluded.request_hash, response = excluded.response, expires_at = excluded.expires_at
  `;
}

export async function readRatingReply(sql: ISql, ratingId: string): Promise<Reply["reply"] | null> {
  const [reply] = await sql<RatingReplyRow[]>`
    SELECT body, created_at AS "createdAt" FROM public.rating_replies WHERE rating_id = ${ratingId}
  `.parsers(timestampParsers);
  return reply ? presentReply(reply) : null;
}

function presentReply({ body, createdAt }: RatingReplyRow) {
  return {
    body,
    createdAt: createdAt.toISOString(),
    editableUntil: new Date(createdAt.getTime() + dayMs).toISOString(),
  };
}

export async function saveReviewReply(sql: TransactionSql, command: ReplyCommand) {
  if (!(await lockScopedReview(sql, command))) return { kind: "not_found" } as const;
  const key = commandKey(command, "reply", command.body);
  const receipt = await previousReceipt(sql, key);
  if (receipt)
    return receipt.matches
      ? ({ kind: "saved", output: merchantReviewReplyOutput.parse(receipt.response) } as const)
      : ({ kind: "idempotency_conflict" } as const);
  const timestamp = command.now.toISOString();
  const [row] = await sql<RatingReplyRow[]>`
    INSERT INTO public.rating_replies AS reply (rating_id, body, created_at, updated_at)
    VALUES (${command.ratingId}, ${command.body}, ${timestamp}, ${timestamp})
    ON CONFLICT (rating_id) DO UPDATE SET body = excluded.body, updated_at = greatest(reply.updated_at, excluded.updated_at)
    WHERE reply.created_at > ${timestamp}::timestamptz - interval '24 hours'
    RETURNING body, created_at AS "createdAt"
  `.parsers(timestampParsers);
  if (!row) return { kind: "edit_window_closed" } as const;
  const output = { ratingId: command.ratingId, reply: presentReply(row) };
  await writeReceipt(sql, key, output);
  return { kind: "saved", output } as const;
}

export async function saveReviewReport(sql: TransactionSql, command: ReportCommand) {
  if (!(await lockScopedReview(sql, command))) return { kind: "not_found" } as const;
  const key = commandKey(command, "report", command.reason);
  const receipt = await previousReceipt(sql, key);
  if (receipt)
    return receipt.matches
      ? ({ kind: "saved", output: merchantReviewReportOutput.parse(receipt.response) } as const)
      : ({ kind: "idempotency_conflict" } as const);
  await sql`
    INSERT INTO public.rating_reports (rating_id, reason, reported_at)
    VALUES (${command.ratingId}, ${command.reason}, ${command.now.toISOString()}) ON CONFLICT DO NOTHING
  `;
  const [row] = await sql<{ reportedAt: Date }[]>`
    SELECT reported_at AS "reportedAt" FROM public.rating_reports WHERE rating_id = ${command.ratingId}
  `.parsers(timestampParsers);
  if (!row) throw new Error("Expected the persisted rating report.");
  const output = { ratingId: command.ratingId, reportedAt: row.reportedAt.toISOString() };
  await writeReceipt(sql, key, output);
  return { kind: "saved", output } as const;
}

export async function pruneMerchantReviewReceipts(sql: ISql, now: Date): Promise<void> {
  await sql`DELETE FROM public.merchant_review_receipts WHERE expires_at <= ${now.toISOString()}`;
}
