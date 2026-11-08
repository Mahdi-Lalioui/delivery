import { bulkPriceAdjustment } from "@zaafran/contracts/menu-price";
import type { BulkPriceSelection } from "./bulk-price-http";

type Adjustment = BulkPriceSelection["adjustment"];

// The server decides whether an undo is still allowed; this only hides an expired button.
const UNDO_WINDOW_MS = 10 * 60 * 1_000;

function normalizeDigits(input: string): string {
  return input.trim().replace(/[٠-٩۰-۹]/g, (digit) => {
    const zero = digit <= "٩" ? "٠" : "۰";
    return String(digit.charCodeAt(0) - zero.charCodeAt(0));
  });
}

function parsePercentBasisPoints(value: string): number | undefined {
  const match = /^([0-9]+)(?:[.,]([0-9]{1,2}))?$/.exec(normalizeDigits(value));
  if (!match) return undefined;
  const [, whole = "", fraction = ""] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function parseWholeDinars(value: string): number | undefined {
  const digits = normalizeDigits(value);
  return /^[0-9]+$/.test(digits) ? Number(digits) : undefined;
}

export function parseBulkAdjustment({
  mode,
  direction,
  value,
}: {
  mode: Adjustment["kind"];
  direction: "raise" | "lower";
  value: string;
}): Adjustment | undefined {
  const magnitude = mode === "percent" ? parsePercentBasisPoints(value) : parseWholeDinars(value);
  if (magnitude === undefined || magnitude === 0) return undefined;
  const signed = direction === "raise" ? magnitude : -magnitude;
  const candidate =
    mode === "percent"
      ? { kind: "percent" as const, basisPoints: signed }
      : { kind: "fixed" as const, amountDzd: signed };
  const parsed = bulkPriceAdjustment.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

// The first instant at which isUndoOffered turns false, so a timer can re-render the panel then.
export function undoClosesAtMs(appliedAtMs: number): number {
  return appliedAtMs + UNDO_WINDOW_MS + 1;
}

export function isUndoOffered({ appliedAtMs, nowMs }: { appliedAtMs: number; nowMs: number }) {
  const elapsedMs = nowMs - appliedAtMs;
  return elapsedMs >= 0 && elapsedMs <= UNDO_WINDOW_MS;
}
