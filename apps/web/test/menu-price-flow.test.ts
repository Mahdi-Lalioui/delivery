import { expect, test } from "vitest";
import { initialBulkPriceState, reduceBulkPrice } from "../src/menu-price/bulk-price-flow";
import type { BulkPriceSelection } from "../src/menu-price/bulk-price-http";

const itemId = "019d6abc-1234-7234-8234-123456789002";
const batchId = "019d6abc-1234-7234-8234-123456789003";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const selection = {
  itemIds: [itemId],
  adjustment: { kind: "percent", basisPoints: 1_000 },
  roundingUnit: 10,
} satisfies BulkPriceSelection;
const preview = { sessionId, revision: 4, items: [{ itemId, oldPriceDzd: 500, newPriceDzd: 550 }] };
const batch = { batchId, revision: 5, items: preview.items };
const restored = {
  batchId,
  revision: 6,
  items: [{ itemId, oldPriceDzd: 550, newPriceDzd: 500 }],
};
const appliedAtMs = Date.UTC(2026, 10, 7, 12);

const previewed = reduceBulkPrice(initialBulkPriceState, {
  kind: "preview-loaded",
  selection,
  preview,
});
const applied = reduceBulkPrice(
  reduceBulkPrice(previewed, { kind: "apply-started", idempotencyKey: "apply-1" }),
  { kind: "apply-finished", result: { kind: "saved", data: batch }, atMs: appliedAtMs },
);

test("[MER-11] holds the preview so apply sends the same selection and revision", () => {
  expect(previewed).toEqual({ kind: "previewed", selection, preview });
  expect(applied).toEqual({ kind: "applied", batch, appliedAtMs, isUndoClosed: false });
});

test("[MER-11] keeps the apply key only after an uncertain failure", () => {
  const applying = reduceBulkPrice(previewed, { kind: "apply-started", idempotencyKey: "k" });
  expect(applying).toEqual({ kind: "applying", selection, preview, idempotencyKey: "k" });
  expect(
    reduceBulkPrice(applying, {
      kind: "apply-finished",
      result: { kind: "error", shouldReuseKey: true },
      atMs: appliedAtMs,
    }),
  ).toEqual({ kind: "previewed", selection, preview, retryKey: "k", failure: "error" });
  expect(
    reduceBulkPrice(applying, {
      kind: "apply-finished",
      result: { kind: "error", shouldReuseKey: false },
      atMs: appliedAtMs,
    }),
  ).toEqual({ kind: "previewed", selection, preview, failure: "error" });
});

test("[MER-11] discards a stale preview after a revision conflict", () => {
  const applying = reduceBulkPrice(previewed, { kind: "apply-started", idempotencyKey: "k" });
  expect(
    reduceBulkPrice(applying, {
      kind: "apply-finished",
      result: { kind: "revision-conflict" },
      atMs: appliedAtMs,
    }),
  ).toEqual({ kind: "editing", failure: "revision-conflict" });
});

test("[MER-11] drops the preview when the selection changes", () => {
  expect(reduceBulkPrice(previewed, { kind: "selection-changed" })).toEqual({ kind: "editing" });
});

test("[MER-11] undoes the applied batch and ends the flow", () => {
  const undoing = reduceBulkPrice(applied, { kind: "undo-started", idempotencyKey: "undo-1" });
  expect(undoing).toEqual({
    kind: "undoing",
    batch,
    appliedAtMs,
    isUndoClosed: false,
    idempotencyKey: "undo-1",
  });
  expect(
    reduceBulkPrice(undoing, { kind: "undo-finished", result: { kind: "saved", data: restored } }),
  ).toEqual({ kind: "undone", batch: restored });
});

test.each(["undo-expired", "price-changed", "already-undone"] as const)(
  "[MER-11] closes undo for good after a %s rejection",
  (kind) => {
    const undoing = reduceBulkPrice(applied, { kind: "undo-started", idempotencyKey: "u" });
    expect(reduceBulkPrice(undoing, { kind: "undo-finished", result: { kind } })).toEqual({
      kind: "applied",
      batch,
      appliedAtMs,
      isUndoClosed: true,
      failure: kind,
    });
  },
);

test("[MER-11] keeps the undo key after an uncertain undo failure", () => {
  const undoing = reduceBulkPrice(applied, { kind: "undo-started", idempotencyKey: "u" });
  expect(
    reduceBulkPrice(undoing, {
      kind: "undo-finished",
      result: { kind: "rate-limited", shouldReuseKey: true },
    }),
  ).toEqual({
    kind: "applied",
    batch,
    appliedAtMs,
    isUndoClosed: false,
    retryKey: "u",
    failure: "rate-limited",
  });
});

test("[MER-11] ignores events that do not fit the current step", () => {
  expect(
    reduceBulkPrice(initialBulkPriceState, { kind: "undo-started", idempotencyKey: "u" }),
  ).toBe(initialBulkPriceState);
  expect(reduceBulkPrice(applied, { kind: "apply-started", idempotencyKey: "a" })).toBe(applied);
  expect(reduceBulkPrice(applied, { kind: "reset" })).toEqual({ kind: "editing" });
});
