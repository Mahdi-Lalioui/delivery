import { isBulkPriceUndoOpen } from "@zaafran/domain/bulk-price-change";
import type { TransactionSql } from "postgres";
import type { CommandChange, CommandRequest } from "./menu-commands.js";
import { timestampParsers } from "./timestamp-parsers.js";

interface BulkPriceUndoInput {
  readonly batchId: string;
  readonly expectedRevision: number;
}
export type BulkPriceUndo = CommandRequest<BulkPriceUndoInput>;

interface RestoredPrice {
  readonly itemId: string;
  readonly oldPriceDzd: number;
  readonly newPriceDzd: number;
}

type UndoFailure =
  "not_found" | "undo_window_expired" | "price_changed_since_apply" | "price_change_already_undone";

interface HistoryRow {
  readonly itemId: string;
  readonly appliedOldPriceDzd: number;
  readonly appliedNewPriceDzd: number;
}

interface BatchScope {
  readonly merchantId: string;
  readonly batchId: string;
}

async function lockBatch(sql: TransactionSql, { merchantId, batchId }: BatchScope) {
  const [batch] = await sql<{ appliedAt: Date; isUndone: boolean }[]>`
    SELECT applied_at AS "appliedAt", undone_at IS NOT NULL AS "isUndone"
    FROM public.price_change_batches
    WHERE merchant_id = ${merchantId} AND id = ${batchId}
    FOR UPDATE
  `.parsers(timestampParsers);
  return batch;
}

async function readHistory(sql: TransactionSql, { merchantId, batchId }: BatchScope) {
  return sql<HistoryRow[]>`
    SELECT item_id AS "itemId", old_price_dzd AS "appliedOldPriceDzd",
      new_price_dzd AS "appliedNewPriceDzd"
    FROM public.price_history
    WHERE merchant_id = ${merchantId} AND batch_id = ${batchId}
    ORDER BY item_id
  `;
}

async function lockLivePrices(
  sql: TransactionSql,
  { merchantId, itemIds }: { merchantId: string; itemIds: readonly string[] },
): Promise<Map<string, number>> {
  const rows = await sql<{ itemId: string; priceDzd: number }[]>`
    SELECT id AS "itemId", price_dzd AS "priceDzd" FROM public.items
    WHERE merchant_id = ${merchantId} AND id = ANY(${[...itemIds]}::uuid[]) AND archived_at IS NULL
    ORDER BY id
    FOR NO KEY UPDATE
  `;
  return new Map(rows.map((row) => [row.itemId, row.priceDzd]));
}

function isUnchangedSinceApply(history: readonly HistoryRow[], live: Map<string, number>) {
  return history.every((row) => live.get(row.itemId) === row.appliedNewPriceDzd);
}

async function restorePrices(sql: TransactionSql, request: BulkPriceUndo, history: HistoryRow[]) {
  const { merchantId, input, now } = request;
  const itemIds = history.map((row) => row.itemId);
  const restoredPrices = history.map((row) => row.appliedOldPriceDzd);
  await sql`
    UPDATE public.items AS item SET price_dzd = change.old_price
    FROM unnest(${itemIds}::uuid[], ${restoredPrices}::integer[]) AS change(item_id, old_price)
    WHERE item.merchant_id = ${merchantId} AND item.id = change.item_id
  `;
  await sql`
    UPDATE public.price_change_batches SET undone_at = ${now.toISOString()}::timestamptz
    WHERE merchant_id = ${merchantId} AND id = ${input.batchId}
  `;
}

export async function undoBulkPrice(
  sql: TransactionSql,
  request: BulkPriceUndo,
): Promise<
  CommandChange<{ readonly batchId: string; readonly items: readonly RestoredPrice[] }, UndoFailure>
> {
  const scope = { merchantId: request.merchantId, batchId: request.input.batchId };
  const batch = await lockBatch(sql, scope);
  if (!batch) return { kind: "not_found" };
  if (batch.isUndone) return { kind: "price_change_already_undone" };
  if (!isBulkPriceUndoOpen({ appliedAt: batch.appliedAt, now: request.now })) {
    return { kind: "undo_window_expired" };
  }

  const history = await readHistory(sql, scope);
  const itemIds = history.map((row) => row.itemId);
  const live = await lockLivePrices(sql, { merchantId: scope.merchantId, itemIds });
  if (!isUnchangedSinceApply(history, live)) return { kind: "price_changed_since_apply" };

  await restorePrices(sql, request, history);
  const items = history.map((row) => ({
    itemId: row.itemId,
    oldPriceDzd: row.appliedNewPriceDzd,
    newPriceDzd: row.appliedOldPriceDzd,
  }));
  return { kind: "changed", value: { batchId: scope.batchId, items } };
}
