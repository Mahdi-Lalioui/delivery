import { merchantRamadanInput } from "@zaafran/contracts/merchant-hours";
import {
  formatClock,
  maxRangesPerDay,
  normalizeDigits,
  parseClock,
  type RangeDraft,
} from "./hours-editor";
import type { RamadanInput } from "./hours-http";

type StoredRange = RamadanInput["weekly"][number]["ranges"][number];
type StoredEndpoint = StoredRange["opens"];
export type EndpointDraft =
  | { readonly kind: "maghrib"; readonly offset: string }
  | { readonly kind: "clock"; readonly time: string };
interface RamadanRangeDraft {
  readonly opens: EndpointDraft;
  readonly closes: EndpointDraft;
}
export interface RamadanDraft {
  readonly weekly: readonly {
    readonly weekday: number;
    readonly ranges: readonly RamadanRangeDraft[];
  }[];
  readonly suhoor: RangeDraft | null;
  readonly method: RamadanInput["method"];
  readonly adjustment: string;
}
type RamadanError = { field: "day"; weekday: number } | { field: "suhoor" | "adjustment" };
export type RamadanValidation =
  { kind: "valid"; input: RamadanInput } | { kind: "invalid"; errors: RamadanError[] };

/** Signed whole minutes, accepting "+", "-", the Unicode minus and Arabic-Indic digits. */
export function parseMinuteOffset(text: string): number | undefined {
  const match = /^([+\-−]?)([0-9]+)$/.exec(normalizeDigits(text));
  if (!match) return undefined;
  const [, sign = "", digits = ""] = match;
  const magnitude = Number(digits);
  return sign === "-" || sign === "−" ? -magnitude : magnitude;
}

function toEndpointDraft(endpoint: StoredEndpoint): EndpointDraft {
  return endpoint.kind === "maghrib"
    ? { kind: "maghrib", offset: String(endpoint.minutes) }
    : { kind: "clock", time: formatClock(endpoint.minuteOfDay) };
}

export function toRamadanDraft(schedule: RamadanInput | null): RamadanDraft {
  if (!schedule) {
    const weekly = Array.from({ length: 7 }, (_, weekday) => ({ weekday, ranges: [] }));
    return { weekly, suhoor: null, method: "Algeria", adjustment: "0" };
  }
  const { suhoor } = schedule;
  return {
    weekly: schedule.weekly.map(({ weekday, ranges }) => ({
      weekday,
      ranges: ranges.map(({ opens, closes }) => ({
        opens: toEndpointDraft(opens),
        closes: toEndpointDraft(closes),
      })),
    })),
    suhoor: suhoor && {
      opens: formatClock(suhoor.opensMinute),
      closes: formatClock(suhoor.closesMinute),
    },
    method: schedule.method,
    adjustment: String(schedule.adjustmentMinutes),
  };
}

function parseEndpoint(endpoint: EndpointDraft): StoredEndpoint | undefined {
  if (endpoint.kind === "maghrib") {
    const minutes = parseMinuteOffset(endpoint.offset);
    return minutes === undefined ? undefined : { kind: "maghrib", minutes };
  }
  const minuteOfDay = parseClock(endpoint.time);
  return minuteOfDay === undefined ? undefined : { kind: "clock", minuteOfDay };
}

function parseDay(ranges: readonly RamadanRangeDraft[]): StoredRange[] | undefined {
  const parsed: StoredRange[] = [];
  for (const range of ranges) {
    const opens = parseEndpoint(range.opens);
    const closes = parseEndpoint(range.closes);
    if (!opens || !closes) return undefined;
    parsed.push({ opens, closes });
  }
  return parsed;
}

function parseSuhoor(suhoor: RangeDraft | null) {
  if (!suhoor) return null;
  const opensMinute = parseClock(suhoor.opens);
  const closesMinute = parseClock(suhoor.closes);
  return opensMinute === undefined || closesMinute === undefined
    ? undefined
    : { opensMinute, closesMinute };
}

function contractErrors(path: readonly PropertyKey[], weekly: RamadanDraft["weekly"]) {
  if (path[0] === "suhoor") return { field: "suhoor" } as const;
  if (path[0] === "adjustmentMinutes") return { field: "adjustment" } as const;
  const day = typeof path[1] === "number" ? weekly[path[1]] : undefined;
  return path[0] === "weekly" && day ? ({ field: "day", weekday: day.weekday } as const) : null;
}

function errorKey(error: RamadanError): string {
  return error.field === "day" ? `day-${String(error.weekday)}` : error.field;
}

/** Reads what can be read locally, then lets the contract judge the rest. */
export function toRamadanInput(draft: RamadanDraft): RamadanValidation {
  const errors: RamadanError[] = [];
  const weekly = draft.weekly.map(({ weekday, ranges }) => {
    const parsed = parseDay(ranges);
    if (!parsed) errors.push({ field: "day", weekday });
    return { weekday, ranges: parsed ?? [] };
  });
  const suhoor = parseSuhoor(draft.suhoor);
  if (suhoor === undefined) errors.push({ field: "suhoor" });
  const adjustmentMinutes = parseMinuteOffset(draft.adjustment);
  if (adjustmentMinutes === undefined) errors.push({ field: "adjustment" });
  const result = merchantRamadanInput.safeParse({
    weekly,
    suhoor: suhoor ?? null,
    method: draft.method,
    adjustmentMinutes: adjustmentMinutes ?? 0,
  });
  if (result.success && errors.length === 0) return { kind: "valid", input: result.data };
  const fromContract = result.success
    ? []
    : result.error.issues.flatMap(({ path }) => contractErrors(path, draft.weekly) ?? []);
  const unique = new Map([...errors, ...fromContract].map((error) => [errorKey(error), error]));
  const order = (error: RamadanError) =>
    error.field === "day" ? error.weekday : 7 + Number(error.field === "adjustment");
  return { kind: "invalid", errors: [...unique.values()].sort((a, b) => order(a) - order(b)) };
}

type RangeAddress = { weekday: number; index: number };

// The SPEC example: open at Maghrib, close at 02:00 after midnight.
const newRamadanRange: RamadanRangeDraft = {
  opens: { kind: "maghrib", offset: "0" },
  closes: { kind: "clock", time: "02:00" },
};
const newSuhoor: RangeDraft = { opens: "03:00", closes: "04:30" };

function mapRamadanDay(
  draft: RamadanDraft,
  weekday: number,
  change: (ranges: readonly RamadanRangeDraft[]) => readonly RamadanRangeDraft[],
): RamadanDraft {
  return {
    ...draft,
    weekly: draft.weekly.map((day) =>
      day.weekday === weekday ? { weekday, ranges: change(day.ranges) } : day,
    ),
  };
}

export function canAddRamadanRange(draft: RamadanDraft, weekday: number): boolean {
  const day = draft.weekly.find((entry) => entry.weekday === weekday);
  return day !== undefined && day.ranges.length < maxRangesPerDay;
}

export function addRamadanRange(draft: RamadanDraft, weekday: number): RamadanDraft {
  if (!canAddRamadanRange(draft, weekday)) return draft;
  return mapRamadanDay(draft, weekday, (ranges) => [...ranges, newRamadanRange]);
}

export function updateRamadanEndpoint(
  draft: RamadanDraft,
  change: RangeAddress & { end: keyof RamadanRangeDraft; endpoint: EndpointDraft },
): RamadanDraft {
  return mapRamadanDay(draft, change.weekday, (ranges) =>
    ranges.map((range, index) =>
      index === change.index ? { ...range, [change.end]: change.endpoint } : range,
    ),
  );
}

export function removeRamadanRange(draft: RamadanDraft, { weekday, index }: RangeAddress) {
  return mapRamadanDay(draft, weekday, (ranges) => ranges.filter((_, at) => at !== index));
}

export function switchEndpointKind(
  endpoint: EndpointDraft,
  kind: EndpointDraft["kind"],
): EndpointDraft {
  if (endpoint.kind === kind) return endpoint;
  return kind === "maghrib" ? { kind, offset: "0" } : { kind, time: "" };
}

export function toggleRamadanSuhoor(draft: RamadanDraft, isOn: boolean): RamadanDraft {
  if (isOn === (draft.suhoor !== null)) return draft;
  return { ...draft, suhoor: isOn ? newSuhoor : null };
}
