import type { TransactionSql } from "postgres";
import { lockMerchantAdmin } from "./merchant-access.js";
import type { MerchantCommand } from "./merchant-receipts.js";

type BillingOperation = "invoice_issue" | "invoice_void" | "payment_record" | "settings_update";
type BillingFailure =
  | "forbidden"
  | "not_found"
  | "invalid_status"
  | "idempotency_conflict"
  | "duplicate_period"
  | "invoice_total_out_of_range"
  | "invoice_sequence_exhausted"
  | "amount_mismatch"
  | "proof_unavailable";

export interface BillingWriteRequest<Input> extends MerchantCommand {
  readonly adminUserId: string;
  readonly input: Input;
  readonly now: Date;
}

export type BillingChange<Value> =
  { readonly kind: "applied"; readonly value: Value } | { readonly kind: BillingFailure };

type BillingResult<Value> =
  BillingChange<Value> | { readonly kind: "replayed"; readonly value: Value };

interface BillingCommand<Value> {
  readonly operation: BillingOperation;
  readonly targetId: string | null;
  readonly apply: (actorId: string) => Promise<BillingChange<Value>>;
}

export async function runBillingCommand<Value extends object>(
  sql: TransactionSql,
  request: BillingWriteRequest<{ readonly reason: string }>,
  { operation, targetId, apply }: BillingCommand<Value>,
): Promise<BillingResult<Value>> {
  const { adminUserId, idempotencyKeyHash, requestHash, input, now } = request;
  const actorId = await lockMerchantAdmin(sql, adminUserId);
  if (!actorId) return { kind: "forbidden" };
  const lockKey = [actorId, operation, Buffer.from(idempotencyKeyHash).toString("hex")].join(":");
  await sql`SELECT pg_advisory_xact_lock(492216, hashtext(${lockKey}))`;
  const [receipt] = await sql<{ matches: boolean; result: Value }[]>`
    SELECT request_hash = ${requestHash} AND target_id IS NOT DISTINCT FROM ${targetId}::uuid AS matches, result
    FROM public.billing_command_receipts
    WHERE actor_id = ${actorId} AND operation = ${operation} AND key_hash = ${idempotencyKeyHash}
  `;
  if (receipt)
    return receipt.matches
      ? { kind: "replayed", value: receipt.result }
      : { kind: "idempotency_conflict" };

  const result = await apply(actorId);
  if (result.kind !== "applied") return result;
  await sql`
    INSERT INTO public.billing_command_receipts
      (actor_id, operation, key_hash, request_hash, target_id, reason, result, recorded_at)
    VALUES (${actorId}, ${operation}, ${idempotencyKeyHash}, ${requestHash}, ${targetId},
      ${input.reason}, ${JSON.stringify(result.value)}::jsonb, ${now.toISOString()})
  `;
  return result;
}

export async function auditInvoice(
  sql: TransactionSql,
  {
    actorId,
    merchantId,
    action,
    reason,
    now,
  }: {
    actorId: string;
    merchantId: string;
    action: "invoice_issued" | "invoice_voided" | "invoice_payment_recorded";
    reason: string;
    now: Date;
  },
) {
  await sql`
    INSERT INTO public.audit_log (actor_id, merchant_id, action, reason, created_at)
    VALUES (${actorId}, ${merchantId}, ${action}, ${reason}, ${now.toISOString()})
  `;
}
