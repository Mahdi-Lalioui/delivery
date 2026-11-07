import type { TransactionSql } from "postgres";
import { lockEditableMenu, type MenuScope } from "./menu-category-access.js";

type Operation = "category_create" | "category_rename" | "category_reorder";

export interface CommandRequest<
  Input extends { readonly expectedRevision: number },
> extends MenuScope {
  readonly input: Input;
  readonly idempotencyKeyHash: Uint8Array;
  readonly requestHash: Uint8Array;
  readonly now: Date;
}

type WriteFailure = "not_found" | "category_limit" | "invalid_order";
type CommandFailure = WriteFailure | "idempotency_conflict" | "revision_conflict";

export type CommandChange<Value> =
  { readonly kind: "changed"; readonly value: Value } | { readonly kind: WriteFailure };

type CommandResult<Value> =
  | ({ readonly kind: "applied"; readonly revision: number } & Value)
  | ({ readonly kind: "replayed"; readonly revision: number } & Value)
  | { readonly kind: CommandFailure };

interface CommandReceipt<Value> {
  readonly matches: boolean;
  readonly revision: number;
  readonly result: Value;
}

interface Command<Value> {
  readonly operation: Operation;
  readonly apply: () => Promise<CommandChange<Value>>;
}

async function readReceipt<Value>(
  sql: TransactionSql,
  request: CommandRequest<{ readonly expectedRevision: number }>,
  operation: Operation,
): Promise<CommandReceipt<Value> | undefined> {
  const { merchantId, accountId, requestHash, idempotencyKeyHash } = request;
  const [receipt] = await sql<CommandReceipt<Value>[]>`
    SELECT request_hash = ${requestHash} AS matches, revision::double precision AS revision, result
    FROM public.menu_command_receipts
    WHERE merchant_id = ${merchantId} AND actor_id = ${accountId}
      AND operation = ${operation} AND key_hash = ${idempotencyKeyHash}
  `;
  return receipt;
}

async function recordChange(
  sql: TransactionSql,
  request: CommandRequest<{ readonly expectedRevision: number }>,
  { operation, value }: { operation: Operation; value: object },
): Promise<number> {
  const { merchantId, accountId, requestHash, idempotencyKeyHash, now } = request;
  const [menu] = await sql<{ revision: number }[]>`
    UPDATE public.merchants SET menu_revision = menu_revision + 1 WHERE id = ${merchantId}
    RETURNING menu_revision::double precision AS revision
  `;
  if (!menu) throw new Error("Menu revision update returned no row.");

  await sql`
    INSERT INTO public.menu_command_receipts
      (merchant_id, actor_id, operation, key_hash, request_hash, revision, result, recorded_at)
    VALUES (${merchantId}, ${accountId}, ${operation}, ${idempotencyKeyHash}, ${requestHash},
      ${menu.revision}, ${JSON.stringify(value)}::jsonb, ${now.toISOString()}::timestamptz)
  `;
  return menu.revision;
}

export async function runCategoryCommand<Value extends object>(
  sql: TransactionSql,
  request: CommandRequest<{ readonly expectedRevision: number }>,
  { operation, apply }: Command<Value>,
): Promise<CommandResult<Value>> {
  const revision = await lockEditableMenu(sql, request);
  if (revision === undefined) return { kind: "not_found" };

  const receipt = await readReceipt<Value>(sql, request, operation);
  if (receipt) {
    return receipt.matches
      ? { kind: "replayed", revision: receipt.revision, ...receipt.result }
      : { kind: "idempotency_conflict" };
  }

  if (revision !== request.input.expectedRevision || revision === Number.MAX_SAFE_INTEGER)
    return { kind: "revision_conflict" };

  const change = await apply();
  if (change.kind !== "changed") return change;
  const nextRevision = await recordChange(sql, request, { operation, value: change.value });
  return { kind: "applied", revision: nextRevision, ...change.value };
}
