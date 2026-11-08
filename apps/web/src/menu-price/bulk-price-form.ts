import { parseBulkAdjustment } from "./bulk-price-editor";
import type { BulkPriceSelection } from "./bulk-price-http";

type Mode = BulkPriceSelection["adjustment"]["kind"];
export type RoundingUnit = BulkPriceSelection["roundingUnit"];

export interface BulkPriceForm {
  readonly selectedIds: ReadonlySet<string>;
  readonly direction: "raise" | "lower";
  readonly mode: Mode;
  readonly amount: string;
  readonly roundingUnit: RoundingUnit;
  readonly formError: "invalidAmount" | "noSelection" | null;
}

export type BulkFormPatch = Partial<
  Pick<BulkPriceForm, "direction" | "mode" | "amount" | "roundingUnit">
>;

type SelectionRead =
  | { kind: "ready"; selection: BulkPriceSelection }
  | { kind: "invalid"; formError: NonNullable<BulkPriceForm["formError"]> };

export function makeBulkPriceForm(): BulkPriceForm {
  return {
    selectedIds: new Set(),
    direction: "raise",
    mode: "percent",
    amount: "",
    roundingUnit: 10,
    formError: null,
  };
}

export function changeBulkForm(form: BulkPriceForm, patch: BulkFormPatch): BulkPriceForm {
  return { ...form, ...patch, formError: null };
}

export function toggleBulkItem(form: BulkPriceForm, itemId: string): BulkPriceForm {
  const selectedIds = new Set(form.selectedIds);
  if (selectedIds.has(itemId)) selectedIds.delete(itemId);
  else selectedIds.add(itemId);
  return { ...form, selectedIds, formError: null };
}

export function toggleAllBulkItems(form: BulkPriceForm, itemIds: readonly string[]): BulkPriceForm {
  const isAllSelected = itemIds.every((itemId) => form.selectedIds.has(itemId));
  return { ...form, selectedIds: new Set(isAllSelected ? [] : itemIds), formError: null };
}

// Items archived since they were ticked are dropped; the order follows the menu.
export function readBulkSelection(form: BulkPriceForm, itemIds: readonly string[]): SelectionRead {
  const selected = itemIds.filter((itemId) => form.selectedIds.has(itemId));
  if (selected.length === 0) return { kind: "invalid", formError: "noSelection" };
  const adjustment = parseBulkAdjustment({
    mode: form.mode,
    direction: form.direction,
    value: form.amount,
  });
  if (!adjustment) return { kind: "invalid", formError: "invalidAmount" };
  return {
    kind: "ready",
    selection: { itemIds: selected, adjustment, roundingUnit: form.roundingUnit },
  };
}
