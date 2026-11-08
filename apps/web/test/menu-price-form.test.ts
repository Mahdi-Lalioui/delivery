import { expect, test } from "vitest";
import { initialBulkPriceState, reduceBulkPrice } from "../src/menu-price/bulk-price-flow";
import {
  changeBulkForm,
  makeBulkPriceForm,
  readBulkSelection,
  toggleAllBulkItems,
  toggleBulkItem,
} from "../src/menu-price/bulk-price-form";

const first = "019d6abc-1234-7234-8234-123456789002";
const second = "019d6abc-1234-7234-8234-123456789004";
const archived = "019d6abc-1234-7234-8234-123456789005";
const itemIds = [first, second];

test("[MER-11] starts with nothing selected, a raise in percent and 10 DA rounding", () => {
  expect(makeBulkPriceForm()).toEqual({
    selectedIds: new Set(),
    direction: "raise",
    mode: "percent",
    amount: "",
    roundingUnit: 10,
    formError: null,
  });
});

test("[MER-11] toggles single items and the whole category", () => {
  const one = toggleBulkItem(makeBulkPriceForm(), first);
  expect([...one.selectedIds]).toEqual([first]);
  expect([...toggleBulkItem(one, first).selectedIds]).toEqual([]);
  const all = toggleAllBulkItems(one, itemIds);
  expect([...all.selectedIds].sort()).toEqual([...itemIds].sort());
  expect([...toggleAllBulkItems(all, itemIds).selectedIds]).toEqual([]);
});

test("[MER-11] reads the selection in menu order without items that left the category", () => {
  const form = changeBulkForm(
    toggleBulkItem(toggleBulkItem(toggleBulkItem(makeBulkPriceForm(), second), archived), first),
    { amount: "١٢,٥", direction: "lower", roundingUnit: 5 },
  );
  expect(readBulkSelection(form, itemIds)).toEqual({
    kind: "ready",
    selection: {
      itemIds: [first, second],
      adjustment: { kind: "percent", basisPoints: -1_250 },
      roundingUnit: 5,
    },
  });
});

test("[MER-11] reports an empty selection before an invalid amount", () => {
  const empty = changeBulkForm(makeBulkPriceForm(), { amount: "abc" });
  expect(readBulkSelection(empty, itemIds)).toEqual({ kind: "invalid", formError: "noSelection" });
  const onlyArchived = toggleBulkItem(empty, archived);
  expect(readBulkSelection(onlyArchived, itemIds)).toEqual({
    kind: "invalid",
    formError: "noSelection",
  });
  const fixed = changeBulkForm(toggleBulkItem(empty, first), { mode: "fixed", amount: "1.5" });
  expect(readBulkSelection(fixed, itemIds)).toEqual({
    kind: "invalid",
    formError: "invalidAmount",
  });
});

test("[MER-11] clears a shown form error once the merchant edits the form", () => {
  const shown = { ...makeBulkPriceForm(), formError: "invalidAmount" as const };
  expect(changeBulkForm(shown, { amount: "5" }).formError).toBeNull();
  expect(toggleBulkItem(shown, first).formError).toBeNull();
  expect(toggleAllBulkItems(shown, itemIds).formError).toBeNull();
});

test("[MER-11] shows a failed preview without leaving the editing step", () => {
  expect(
    reduceBulkPrice(initialBulkPriceState, { kind: "preview-failed", failure: "invalid-change" }),
  ).toEqual({ kind: "editing", failure: "invalid-change" });
  const previewed = reduceBulkPrice(initialBulkPriceState, {
    kind: "preview-loaded",
    selection: { itemIds: [first], adjustment: { kind: "fixed", amountDzd: 50 }, roundingUnit: 1 },
    preview: {
      sessionId: archived,
      revision: 2,
      items: [{ itemId: first, oldPriceDzd: 100, newPriceDzd: 150 }],
    },
  });
  expect(reduceBulkPrice(previewed, { kind: "preview-failed", failure: "error" })).toEqual({
    kind: "editing",
    failure: "error",
  });
  const applying = reduceBulkPrice(previewed, { kind: "apply-started", idempotencyKey: "k" });
  expect(reduceBulkPrice(applying, { kind: "preview-failed", failure: "error" })).toBe(applying);
});
