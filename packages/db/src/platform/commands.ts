import type { TransactionSql } from "postgres";
import { lockMerchantAdmin } from "../merchant-access.js";
import type { MerchantCommand } from "../merchant-receipts.js";

interface CommandIdentity extends MerchantCommand {
  readonly adminUserId: string;
  readonly key: string;
  readonly now: Date;
}

type Entity = "setting" | "flag";

export type PlatformCommandRequest<Input> = CommandIdentity & {
  readonly input: Input & { readonly reason: string };
};

export interface Change<Value extends object> {
  readonly value: Value;
  readonly diff: { readonly before: unknown; readonly after: unknown };
}

type WriteResult<Value extends object, Failure> =
  | { readonly kind: "applied" | "replayed"; readonly value: Value }
  | { readonly kind: "forbidden" | "idempotency_conflict" }
  | Failure;

interface Command<Value extends object, Failure> {
  readonly entity: Entity;
  readonly parseResult: (result: unknown) => Value;
  readonly apply: () => Promise<Change<Value> | Failure>;
}

async function lockReceipt(
  sql: TransactionSql,
  { adminUserId, idempotencyKeyHash, requestHash }: CommandIdentity,
  entity: Entity,
) {
  const lockKey = [adminUserId, entity, Buffer.from(idempotencyKeyHash).toString("hex")].join(":");
  await sql`SELECT pg_advisory_xact_lock(492219, hashtext(${lockKey}))`;
  const [receipt] = await sql<{ matches: boolean; result: unknown }[]>`
    SELECT request_hash = ${requestHash} AS matches, result
    FROM public.platform_command_receipts
    WHERE actor_id = ${adminUserId} AND entity = ${entity} AND key_hash = ${idempotencyKeyHash}
  `;
  return receipt;
}

async function recordReceipt(
  sql: TransactionSql,
  request: PlatformCommandRequest<object>,
  { entity, change }: { entity: Entity; change: Change<object> },
) {
  await sql`
    INSERT INTO public.platform_command_receipts
      (actor_id, entity, entity_id, reason, key_hash, request_hash, diff, result, created_at)
    VALUES (${request.adminUserId}, ${entity}, ${request.key}, ${request.input.reason},
      ${request.idempotencyKeyHash}, ${request.requestHash}, ${JSON.stringify(change.diff)}::jsonb,
      ${JSON.stringify(change.value)}::jsonb, ${request.now.toISOString()}::timestamptz)
  `;
}

export async function runPlatformCommand<Value extends object, Failure extends { kind: string }>(
  sql: TransactionSql,
  request: PlatformCommandRequest<object>,
  { entity, parseResult, apply }: Command<Value, Failure>,
): Promise<WriteResult<Value, Failure>> {
  const adminUserId = await lockMerchantAdmin(sql, request.adminUserId);
  if (!adminUserId) return { kind: "forbidden" };
  const canonicalRequest = { ...request, adminUserId };
  const receipt = await lockReceipt(sql, canonicalRequest, entity);
  if (receipt) {
    return receipt.matches
      ? { kind: "replayed", value: parseResult(receipt.result) }
      : { kind: "idempotency_conflict" };
  }
  const change = await apply();
  if ("kind" in change) return change;
  await recordReceipt(sql, canonicalRequest, { entity, change });
  return { kind: "applied", value: change.value };
}
