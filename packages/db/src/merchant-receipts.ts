import type { TransactionSql } from "postgres";
import { timestampParsers } from "./timestamp-parsers.js";

export interface MerchantCommand {
  readonly idempotencyKeyHash: Uint8Array;
  readonly requestHash: Uint8Array;
}

export type MerchantReviewStatus = "approved" | "rejected";

type ReceiptIdentity = MerchantCommand & {
  readonly actorId: string;
  readonly operation: "application" | "review";
};

export async function lockMerchantCommand(sql: TransactionSql, identity: ReceiptIdentity) {
  const { actorId, operation, idempotencyKeyHash } = identity;
  const lockKey = [actorId, operation, Buffer.from(idempotencyKeyHash).toString("hex")].join(":");
  await sql`SELECT pg_advisory_xact_lock(492214, hashtext(${lockKey}))`;
  const [receipt] = await sql<
    {
      merchantId: string;
      requestMatches: boolean;
      status: "pending_review" | MerchantReviewStatus;
      recordedAt: Date;
    }[]
  >`
    SELECT merchant_id AS "merchantId", request_hash = ${identity.requestHash} AS "requestMatches",
      result_status AS status, recorded_at AS "recordedAt"
    FROM public.merchant_command_receipts
    WHERE actor_id = ${actorId} AND operation = ${operation} AND key_hash = ${idempotencyKeyHash}
  `.parsers(timestampParsers);
  return receipt;
}

export async function recordMerchantCommand(
  sql: TransactionSql,
  identity: ReceiptIdentity,
  result: { merchantId: string; status: "pending_review" | MerchantReviewStatus; at: Date },
): Promise<void> {
  await sql`
    INSERT INTO public.merchant_command_receipts
      (actor_id, operation, key_hash, request_hash, merchant_id, result_status, recorded_at)
    VALUES (${identity.actorId}, ${identity.operation}, ${identity.idempotencyKeyHash},
      ${identity.requestHash}, ${result.merchantId}, ${result.status}, ${result.at.toISOString()}::timestamptz)
  `;
}
