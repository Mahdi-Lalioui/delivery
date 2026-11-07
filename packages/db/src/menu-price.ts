import {
  previewBulkPriceChange,
  type BulkPriceAdjustment,
  type RoundingUnit,
} from "@zaafran/domain/bulk-price-change";
import { dzd } from "@zaafran/domain/money";
import type { TransactionSql } from "postgres";
import type { DatabaseConnection } from "./database.js";
import { readMenuContext, type MenuScope } from "./menu-access.js";
import { runMenuCommand, type CommandChange, type CommandRequest } from "./menu-commands.js";
import { undoBulkPrice, type BulkPriceUndo } from "./menu-price-undo.js";

export type { BulkPriceUndo } from "./menu-price-undo.js";

// Mirrors the items.price_dzd column, which is a Postgres int4 and narrower than the
// generic Dzd safe-integer bound, so an extreme adjustment is rejected before it is stored.
const MAX_ITEM_PRICE_DZD = 2_147_483_647;

export interface BulkPriceInput {
  readonly itemIds: readonly string[];
  readonly adjustment: BulkPriceAdjustment;
  readonly roundingUnit: RoundingUnit;
}

export interface BulkPriceChangeRow {
  readonly itemId: string;
  readonly oldPriceDzd: number;
  readonly newPriceDzd: number;
}

type PreviewOutcome =
  | { readonly kind: "previewed"; readonly items: readonly BulkPriceChangeRow[] }
  | { readonly kind: "not_found" | "invalid_bulk_price_change" };

async function readCurrentPrices(
  sql: TransactionSql,
  { merchantId, itemIds, lock }: { merchantId: string; itemIds: readonly string[]; lock: boolean },
): Promise<{ itemId: string; priceDzd: number }[]> {
  return lock
    ? sql`
        SELECT id AS "itemId", price_dzd AS "priceDzd" FROM public.items
        WHERE merchant_id = ${merchantId} AND id = ANY(${[...itemIds]}::uuid[]) AND archived_at IS NULL
        FOR NO KEY UPDATE
      `
    : sql`
        SELECT id AS "itemId", price_dzd AS "priceDzd" FROM public.items
        WHERE merchant_id = ${merchantId} AND id = ANY(${[...itemIds]}::uuid[]) AND archived_at IS NULL
      `;
}

async function previewBulkPrice(
  sql: TransactionSql,
  { merchantId, input, lock }: { merchantId: string; input: BulkPriceInput; lock: boolean },
): Promise<PreviewOutcome> {
  const rows = await readCurrentPrices(sql, { merchantId, itemIds: input.itemIds, lock });
  if (rows.length !== input.itemIds.length) return { kind: "not_found" };

  const items = rows.map((row) => {
    const price = dzd(row.priceDzd);
    if (!price.ok) throw new Error("Stored item price failed the money boundary check.");
    return { itemId: row.itemId, priceDzd: price.value };
  });
  const preview = previewBulkPriceChange({
    items,
    adjustment: input.adjustment,
    roundingUnit: input.roundingUnit,
  });
  if (!preview.ok) return { kind: "invalid_bulk_price_change" };
  if (preview.value.some((change) => change.newPriceDzd > MAX_ITEM_PRICE_DZD)) {
    return { kind: "invalid_bulk_price_change" };
  }
  return { kind: "previewed", items: preview.value };
}

export async function previewMenuPrices(
  sql: TransactionSql,
  request: MenuScope & BulkPriceInput,
): Promise<
  | {
      readonly kind: "previewed";
      readonly revision: number;
      readonly items: readonly BulkPriceChangeRow[];
    }
  | { readonly kind: "not_found" | "invalid_bulk_price_change" }
> {
  const menu = await readMenuContext(sql, request);
  if (!menu) return { kind: "not_found" };
  const outcome = await previewBulkPrice(sql, {
    merchantId: request.merchantId,
    input: request,
    lock: false,
  });
  return outcome.kind === "previewed"
    ? { kind: "previewed", revision: menu.revision, items: outcome.items }
    : outcome;
}

interface RevisionInput {
  readonly expectedRevision: number;
}
export type BulkPriceApply = CommandRequest<BulkPriceInput & RevisionInput>;

async function applyBulkPrice(
  sql: TransactionSql,
  request: BulkPriceApply,
): Promise<
  CommandChange<
    { readonly batchId: string; readonly items: readonly BulkPriceChangeRow[] },
    "not_found" | "invalid_bulk_price_change"
  >
> {
  const { merchantId, accountId, input, now } = request;
  const preview = await previewBulkPrice(sql, { merchantId, input, lock: true });
  if (preview.kind !== "previewed") return { kind: preview.kind };

  const itemIds = preview.items.map((item) => item.itemId);
  const oldPrices = preview.items.map((item) => item.oldPriceDzd);
  const newPrices = preview.items.map((item) => item.newPriceDzd);

  await sql`
    UPDATE public.items AS item SET price_dzd = change.new_price
    FROM unnest(${itemIds}::uuid[], ${newPrices}::integer[]) AS change(item_id, new_price)
    WHERE item.merchant_id = ${merchantId} AND item.id = change.item_id
  `;

  const [batch] = await sql<{ batchId: string }[]>`
    INSERT INTO public.price_change_batches (merchant_id, actor_id, applied_at)
    VALUES (${merchantId}, ${accountId}, ${now.toISOString()}::timestamptz)
    RETURNING id AS "batchId"
  `;
  if (!batch) throw new Error("Price change batch insert returned no row.");

  await sql`
    INSERT INTO public.price_history (merchant_id, batch_id, item_id, old_price_dzd, new_price_dzd)
    SELECT ${merchantId}::uuid, ${batch.batchId}::uuid, change.item_id, change.old_price, change.new_price
    FROM unnest(${itemIds}::uuid[], ${oldPrices}::integer[], ${newPrices}::integer[])
      AS change(item_id, old_price, new_price)
  `;

  return { kind: "changed", value: { batchId: batch.batchId, items: preview.items } };
}

export function createMenuPriceRepository({ sql }: DatabaseConnection) {
  return {
    preview: (request: MenuScope & BulkPriceInput) =>
      sql.begin("isolation level repeatable read read only", (tx) =>
        previewMenuPrices(tx, request),
      ),
    apply: (request: BulkPriceApply) =>
      sql.begin((tx) =>
        runMenuCommand(tx, request, {
          operation: "bulk_price_apply",
          apply: () => applyBulkPrice(tx, request),
        }),
      ),
    undo: (request: BulkPriceUndo) =>
      sql.begin((tx) =>
        runMenuCommand(tx, request, {
          operation: "bulk_price_undo",
          apply: () => undoBulkPrice(tx, request),
        }),
      ),
  };
}
