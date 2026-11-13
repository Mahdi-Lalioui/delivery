import { maxSpecialDates, merchantHoursInput } from "@zaafran/contracts/merchant-hours";
import {
  maxRangesPerDay,
  normalizeDigits,
  parseDayRanges,
  toRangeDrafts,
  type RangeDraft,
} from "./hours-editor";
import type { HoursInput } from "./hours-http";

type StoredSpecialDates = HoursInput["specialDates"];
/** A dated exception. No ranges closes the whole Algiers civil date. */
export interface SpecialDateDraft {
  /** `YYYY-MM-DD`, as `<input type="date">` reports it. */
  readonly date: string;
  readonly ranges: readonly RangeDraft[];
}
type SpecialDateError = {
  index: number;
  reason: "date" | "time" | "overlap" | "duplicate";
};
export type SpecialDatesValidation =
  | { kind: "valid"; specialDates: StoredSpecialDates }
  | { kind: "invalid"; errors: SpecialDateError[] };

const specialDateSchema = merchantHoursInput.shape.specialDates.element;
const newRange: RangeDraft = { opens: "12:00", closes: "15:00" };

export function toSpecialDateDrafts(stored: StoredSpecialDates): readonly SpecialDateDraft[] {
  return stored.map(({ date, ranges }) => ({ date, ranges: toRangeDrafts(ranges) }));
}

export function canAddSpecialDate(drafts: readonly SpecialDateDraft[]): boolean {
  return drafts.length < maxSpecialDates;
}

/** The caller supplies the starting date (for example today in Algiers); it starts closed. */
export function addSpecialDate(
  drafts: readonly SpecialDateDraft[],
  date: string,
): readonly SpecialDateDraft[] {
  if (!canAddSpecialDate(drafts)) return drafts;
  return [...drafts, { date, ranges: [] }];
}

export function removeSpecialDate(
  drafts: readonly SpecialDateDraft[],
  index: number,
): readonly SpecialDateDraft[] {
  return drafts.filter((_, position) => position !== index);
}

function mapEntry(
  drafts: readonly SpecialDateDraft[],
  index: number,
  change: (entry: SpecialDateDraft) => SpecialDateDraft,
): readonly SpecialDateDraft[] {
  return drafts.map((entry, position) => (position === index ? change(entry) : entry));
}

export function updateSpecialDate(
  drafts: readonly SpecialDateDraft[],
  { index, date }: { index: number; date: string },
): readonly SpecialDateDraft[] {
  return mapEntry(drafts, index, (entry) => ({ ...entry, date }));
}

export function addSpecialDateRange(
  drafts: readonly SpecialDateDraft[],
  index: number,
): readonly SpecialDateDraft[] {
  const entry = drafts[index];
  if (!entry || entry.ranges.length >= maxRangesPerDay) return drafts;
  return mapEntry(drafts, index, () => ({ ...entry, ranges: [...entry.ranges, newRange] }));
}

export function updateSpecialDateRange(
  drafts: readonly SpecialDateDraft[],
  change: { index: number; rangeIndex: number; field: keyof RangeDraft; value: string },
): readonly SpecialDateDraft[] {
  return mapEntry(drafts, change.index, (entry) => ({
    ...entry,
    ranges: entry.ranges.map((range, position) =>
      position === change.rangeIndex ? { ...range, [change.field]: change.value } : range,
    ),
  }));
}

export function removeSpecialDateRange(
  drafts: readonly SpecialDateDraft[],
  { index, rangeIndex }: { index: number; rangeIndex: number },
): readonly SpecialDateDraft[] {
  return mapEntry(drafts, index, (entry) => ({
    ...entry,
    ranges: entry.ranges.filter((_, position) => position !== rangeIndex),
  }));
}

type EntryResult =
  | { kind: "valid"; entry: StoredSpecialDates[number] }
  | { kind: "invalid"; reason: SpecialDateError["reason"] };

/** The contract decides validity, so the editor never disagrees with the API. */
function parseEntry(draft: SpecialDateDraft, seen: Set<string>): EntryResult {
  const ranges = parseDayRanges(draft.ranges);
  const date = normalizeDigits(draft.date);
  const result = specialDateSchema.safeParse({ date, ranges: ranges ?? [] });
  if (!result.success && result.error.issues.some(({ path }) => path[0] === "date")) {
    return { kind: "invalid", reason: "date" };
  }
  if (!ranges) return { kind: "invalid", reason: "time" };
  if (!result.success) return { kind: "invalid", reason: "overlap" };
  if (seen.has(date)) return { kind: "invalid", reason: "duplicate" };
  seen.add(date);
  return { kind: "valid", entry: result.data };
}

export function toSpecialDatesInput(drafts: readonly SpecialDateDraft[]): SpecialDatesValidation {
  const seen = new Set<string>();
  const errors: SpecialDateError[] = [];
  const specialDates: StoredSpecialDates = [];
  drafts.forEach((draft, index) => {
    const result = parseEntry(draft, seen);
    if (result.kind === "valid") specialDates.push(result.entry);
    else errors.push({ index, reason: result.reason });
  });
  return errors.length > 0 ? { kind: "invalid", errors } : { kind: "valid", specialDates };
}
