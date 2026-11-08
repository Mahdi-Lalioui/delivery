import { merchantPromotionInput, merchantPromotionOutput } from "@zaafran/contracts/promotions";
import { PostgresError, type TransactionSql } from "postgres";
import type { DatabaseConnection } from "../database.js";
import { lockEditableMenu, readMenuContext, type MenuScope } from "../menu-access.js";
import type { MerchantCommand } from "../merchant-receipts.js";
import { hasReachedPromotionLimit, readPromotions } from "./queries.js";

export type PromotionInput = ReturnType<typeof merchantPromotionInput.parse>;
type Promotion = ReturnType<typeof merchantPromotionOutput.parse>;

interface PromotionWrite extends MenuScope, MerchantCommand {
  readonly input: PromotionInput;
  readonly now: Date;
}

interface PromotionUpdate extends PromotionWrite {
  readonly promotionId: string;
}

type Operation = "create" | "update";

type WriteResult =
  | { readonly kind: "applied" | "replayed"; readonly promotion: Promotion }
  | { readonly kind: "not_found" | "duplicate_code" | "idempotency_conflict" | "promotion_limit" };

async function readReceipt(
  sql: TransactionSql,
  { merchantId, accountId, idempotencyKeyHash, requestHash }: PromotionWrite,
  operation: Operation,
): Promise<WriteResult | undefined> {
  const [receipt] = await sql<{ matches: boolean; result: unknown }[]>`
    SELECT request_hash = ${requestHash} AS matches, result
    FROM public.promotion_command_receipts
    WHERE merchant_id = ${merchantId} AND actor_id = ${accountId}
      AND operation = ${operation} AND key_hash = ${idempotencyKeyHash}
  `;
  if (!receipt) return undefined;
  return receipt.matches
    ? { kind: "replayed", promotion: merchantPromotionOutput.parse(receipt.result) }
    : { kind: "idempotency_conflict" };
}

async function recordReceipt(
  sql: TransactionSql,
  { merchantId, accountId, idempotencyKeyHash, requestHash, now }: PromotionWrite,
  { operation, promotion }: { operation: Operation; promotion: Promotion },
) {
  await sql`
    INSERT INTO public.promotion_command_receipts
      (merchant_id, actor_id, operation, key_hash, request_hash, result, recorded_at)
    VALUES (${merchantId}, ${accountId}, ${operation}, ${idempotencyKeyHash}, ${requestHash},
      ${JSON.stringify(promotion)}::jsonb, ${now.toISOString()}::timestamptz)
  `;
}

function columns(input: PromotionInput) {
  const { activation, discount, conditions } = merchantPromotionInput.parse(input);
  return {
    code: activation.kind === "code" ? activation.code.trim() : null,
    discount,
    conditions,
  };
}

async function insertPromotion(sql: TransactionSql, request: PromotionWrite) {
  const { merchantId, now } = request;
  const { code, discount, conditions } = columns(request.input);
  const timestamp = now.toISOString();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO public.promotions (merchant_id, code, discount, conditions, created_at, updated_at)
    VALUES (${merchantId}, ${code}, ${JSON.stringify(discount)}::jsonb,
      ${JSON.stringify(conditions)}::jsonb,
      ${timestamp}::timestamptz, ${timestamp}::timestamptz)
    RETURNING id
  `;
  if (!row) throw new Error("Promotion insert returned no row.");
  return row.id;
}

async function replacePromotion(sql: TransactionSql, request: PromotionUpdate) {
  const { merchantId, promotionId, now } = request;
  const { code, discount, conditions } = columns(request.input);
  const [row] = await sql<{ id: string }[]>`
    UPDATE public.promotions
    SET code = ${code}, discount = ${JSON.stringify(discount)}::jsonb,
      conditions = ${JSON.stringify(conditions)}::jsonb,
      updated_at = greatest(updated_at, ${now.toISOString()}::timestamptz)
    WHERE merchant_id = ${merchantId} AND id = ${promotionId}
    RETURNING id
  `;
  return row?.id;
}

interface Command {
  readonly operation: Operation;
  readonly apply: (tx: TransactionSql) => Promise<string | undefined>;
}

async function runWrite(
  { sql }: DatabaseConnection,
  request: PromotionWrite,
  { operation, apply }: Command,
): Promise<WriteResult> {
  try {
    return await sql.begin(async (tx): Promise<WriteResult> => {
      if ((await lockEditableMenu(tx, request, "editor")) === undefined)
        return { kind: "not_found" };
      const receipt = await readReceipt(tx, request, operation);
      if (receipt) return receipt;
      if (operation === "create" && (await hasReachedPromotionLimit(tx, request.merchantId))) {
        return { kind: "promotion_limit" };
      }
      const promotionId = await apply(tx);
      if (promotionId === undefined) return { kind: "not_found" };
      const [promotion] = await readPromotions(tx, request.merchantId, promotionId);
      if (!promotion) throw new Error("Promotion write could not be read back.");
      await recordReceipt(tx, request, { operation, promotion });
      return { kind: "applied", promotion };
    });
  } catch (error) {
    if (
      error instanceof PostgresError &&
      error.code === "23505" &&
      error.constraint_name === "promotions_merchant_code_idx"
    ) {
      return { kind: "duplicate_code" };
    }
    throw error;
  }
}

export function createMerchantPromotionsRepository(connection: DatabaseConnection) {
  return {
    list: (scope: MenuScope) =>
      connection.sql.begin("isolation level repeatable read read only", async (tx) => {
        if (!(await readMenuContext(tx, scope))) return undefined;
        return { promotions: await readPromotions(tx, scope.merchantId) };
      }),
    create: (request: PromotionWrite) =>
      runWrite(connection, request, {
        operation: "create",
        apply: (tx) => insertPromotion(tx, request),
      }),
    update: (request: PromotionUpdate) =>
      runWrite(connection, request, {
        operation: "update",
        apply: (tx) => replacePromotion(tx, request),
      }),
  };
}
