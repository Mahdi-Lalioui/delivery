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
  readonly appliedPriceVersion: string | null;
}

interface LivePrice {
  readonly itemId: string;
  readonly priceDzd: number;
  readonly priceVersion: string;
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
      new_price_dzd AS "appliedNewPriceDzd", applied_price_version::text AS "appliedPriceVersion"
    FROM public.price_history
    WHERE merchant_id = ${merchantId} AND batch_id = ${batchId}
    ORDER BY item_id
  `;
}

async function lockLivePrices(
  sql: TransactionSql,
  { merchantId, itemIds }: { merchantId: string; itemIds: readonly string[] },
): Promise<Map<string, LivePrice>> {
  const rows = await sql<LivePrice[]>`
    SELECT id AS "itemId", price_dzd AS "priceDzd", price_version::text AS "priceVersion"
    FROM public.items
    WHERE merchant_id = ${merchantId} AND id = ANY(${[...itemIds]}::uuid[]) AND archived_at IS NULL
    ORDER BY id
    FOR NO KEY UPDATE
  `;
  return new Map(rows.map((row) => [row.itemId, row]));
}

function isUnchangedSinceApply(history: readonly HistoryRow[], live: Map<string, LivePrice>) {
  return history.every((row) => {
    const price = live.get(row.itemId);
    return (
      row.appliedPriceVersion !== null &&
      price?.priceDzd === row.appliedNewPriceDzd &&
      price.priceVersion === row.appliedPriceVersion
    );
  });
}

async function restorePrices(sql: TransactionSql, request: BulkPriceUndo, history: HistoryRow[]) {
  const { merchantId, input, now } = request;
  const restored = await sql`
    UPDATE public.items AS item SET price_dzd = history.old_price_dzd
    FROM public.price_history AS history
    WHERE history.merchant_id = ${merchantId} AND history.batch_id = ${input.batchId}
      AND item.merchant_id = history.merchant_id AND item.id = history.item_id
      AND item.archived_at IS NULL AND item.price_dzd = history.new_price_dzd
      AND item.price_version = history.applied_price_version
  `;
  if (restored.count !== history.length)
    throw new Error("Locked price history changed during undo.");
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
