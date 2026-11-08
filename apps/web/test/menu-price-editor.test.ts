import { expect, test } from "vitest";
import {
  isUndoOffered,
  parseBulkAdjustment,
  undoClosesAtMs,
} from "../src/menu-price/bulk-price-editor";

test.each([
  ["10", "raise", { kind: "percent", basisPoints: 1_000 }],
  ["2.5", "raise", { kind: "percent", basisPoints: 250 }],
  ["2,5", "lower", { kind: "percent", basisPoints: -250 }],
  [" ١٥ ", "raise", { kind: "percent", basisPoints: 1_500 }],
  ["0.01", "lower", { kind: "percent", basisPoints: -1 }],
  ["1000", "raise", { kind: "percent", basisPoints: 100_000 }],
] as const)("[MER-11] reads %s %% (%s) as exact basis points", (value, direction, expected) => {
  expect(parseBulkAdjustment({ mode: "percent", direction, value })).toEqual(expected);
});

test.each([
  ["50", "raise", { kind: "fixed", amountDzd: 50 }],
  ["۲۰۰", "lower", { kind: "fixed", amountDzd: -200 }],
] as const)("[MER-11] reads %s DA (%s) as a whole-dinar amount", (value, direction, expected) => {
  expect(parseBulkAdjustment({ mode: "fixed", direction, value })).toEqual(expected);
});

test.each([
  ["percent", ""],
  ["percent", "0"],
  ["percent", "0.001"],
  ["percent", "1000.01"],
  ["percent", "-5"],
  ["percent", "1e2"],
  ["percent", "5%"],
  ["fixed", "2.5"],
  ["fixed", "0"],
  ["fixed", "10000001"],
] as const)("[MER-11] rejects %s input %j", (mode, value) => {
  expect(parseBulkAdjustment({ mode, direction: "raise", value })).toBeUndefined();
});

test("[MER-11] offers undo for ten minutes after the apply on the local clock", () => {
  const appliedAtMs = Date.UTC(2026, 10, 7, 12);
  expect(isUndoOffered({ appliedAtMs, nowMs: appliedAtMs })).toBe(true);
  expect(isUndoOffered({ appliedAtMs, nowMs: appliedAtMs + 600_000 })).toBe(true);
  expect(isUndoOffered({ appliedAtMs, nowMs: appliedAtMs + 600_001 })).toBe(false);
});

test("[MER-11] hides undo at the first millisecond after the ten-minute window", () => {
  const appliedAtMs = Date.UTC(2026, 10, 8, 2);
  const closesAtMs = undoClosesAtMs(appliedAtMs);
  expect(isUndoOffered({ appliedAtMs, nowMs: closesAtMs - 1 })).toBe(true);
  expect(isUndoOffered({ appliedAtMs, nowMs: closesAtMs })).toBe(false);
});
