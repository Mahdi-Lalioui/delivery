import type { TransactionSql } from "postgres";
import type { MenuImportError } from "./menu-import-types.js";
import { lockEditableMenu, type MenuScope } from "./menu-access.js";

type Operation =
  | "category_create"
  | "category_rename"
  | "category_reorder"
  | "item_create"
  | "item_update"
  | "item_duplicate"
  | "item_archive"
  | "item_availability"
  | "option_group_create"
  | "option_group_update"
  | "bulk_price_apply"
  | "bulk_price_undo"
  | "hours_replace"
  | "ramadan_replace"
  | "hours_pause"
  | "menu_import";

export interface CommandRequest<
  Input extends { readonly expectedRevision: number },
> extends MenuScope {
  readonly input: Input;
  readonly idempotencyKeyHash: Uint8Array;
  readonly requestHash: Uint8Array;
  readonly now: Date;
}

type CategoryWriteFailure = "not_found" | "category_limit" | "invalid_order";
type WriteFailure =
  | CategoryWriteFailure
  | "photos_unavailable"
  | "invalid_bulk_price_change"
  | "undo_window_expired"
  | "price_changed_since_apply"
  | "price_change_already_undone"
  | "pause_not_in_future"
  | "import_conflict";
type CommandFailure = "not_found" | "idempotency_conflict" | "revision_conflict";

export type CommandChange<Value, Failure extends WriteFailure = CategoryWriteFailure> =
  { readonly kind: "changed"; readonly value: Value } | { readonly kind: Failure };

type CommandResult<Value, Failure extends WriteFailure> =
  | ({ readonly kind: "applied"; readonly revision: number } & Value)
  | ({ readonly kind: "replayed"; readonly revision: number } & Value)
  | { readonly kind: CommandFailure | Failure };

type ImportConflict = {
  readonly kind: "import_conflict";
  readonly errors: readonly MenuImportError[];
};

interface CommandReceipt<Value> {
  readonly matches: boolean;
  readonly revision: number;
  readonly result: Value;
}

interface Command<Value, Failure extends WriteFailure> {
  readonly operation: Operation;
  readonly apply: () => Promise<CommandChange<Value, Failure>>;
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

export function runMenuCommand<Value extends object>(
  sql: TransactionSql,
  request: CommandRequest<{ readonly expectedRevision: number }>,
  command: {
    readonly operation: "menu_import";
    readonly apply: () => Promise<CommandChange<Value, never> | ImportConflict>;
  },
): Promise<CommandResult<Value, never> | ImportConflict>;
export function runMenuCommand<Value extends object, Failure extends WriteFailure>(
  sql: TransactionSql,
  request: CommandRequest<{ readonly expectedRevision: number }>,
  command: Command<Value, Failure>,
): Promise<CommandResult<Value, Failure>>;
export async function runMenuCommand<Value extends object, Failure extends WriteFailure>(
  sql: TransactionSql,
  request: CommandRequest<{ readonly expectedRevision: number }>,
  { operation, apply }: Command<Value, Failure>,
): Promise<CommandResult<Value, Failure>> {
  const access = operation === "item_availability" ? "availability" : "editor";
  const revision = await lockEditableMenu(sql, request, access);
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
  if (!("value" in change)) return change;
  const nextRevision = await recordChange(sql, request, { operation, value: change.value });
  return { kind: "applied", revision: nextRevision, ...change.value };
}
