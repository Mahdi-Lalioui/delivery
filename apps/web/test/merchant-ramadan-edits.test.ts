import { expect, test } from "vitest";
import {
  addRamadanRange,
  canAddRamadanRange,
  removeRamadanRange,
  switchEndpointKind,
  toggleRamadanSuhoor,
  toRamadanDraft,
  toRamadanInput,
  updateRamadanEndpoint,
} from "../src/merchant-hours/ramadan-editor";

const empty = toRamadanDraft(null);

function dayRanges(draft: typeof empty, weekday: number) {
  return draft.weekly.find((day) => day.weekday === weekday)?.ranges ?? [];
}

test("[MER-16] adds an iftar range that opens at Maghrib and closes at 02:00 the next day", () => {
  const draft = addRamadanRange(empty, 3);
  expect(dayRanges(draft, 3)).toEqual([
    { opens: { kind: "maghrib", offset: "0" }, closes: { kind: "clock", time: "02:00" } },
  ]);
  expect(dayRanges(draft, 2)).toEqual([]);
  const result = toRamadanInput(draft);
  expect(result.kind).toBe("valid");
});

test("[MER-16] allows at most four ranges per day", () => {
  let draft = empty;
  for (let count = 0; count < 4; count += 1) draft = addRamadanRange(draft, 0);
  expect(canAddRamadanRange(draft, 0)).toBe(false);
  expect(canAddRamadanRange(draft, 1)).toBe(true);
  expect(addRamadanRange(draft, 0)).toBe(draft);
  expect(canAddRamadanRange(empty, 9)).toBe(false);
});

test("[MER-16] edits one endpoint and removes one range without touching the others", () => {
  const two = addRamadanRange(addRamadanRange(empty, 5), 5);
  const edited = updateRamadanEndpoint(two, {
    weekday: 5,
    index: 1,
    end: "opens",
    endpoint: { kind: "maghrib", offset: "-60" },
  });
  expect(dayRanges(edited, 5)[1]?.opens).toEqual({ kind: "maghrib", offset: "-60" });
  expect(dayRanges(edited, 5)[0]?.opens).toEqual({ kind: "maghrib", offset: "0" });
  const removed = removeRamadanRange(edited, { weekday: 5, index: 0 });
  expect(dayRanges(removed, 5)).toEqual([dayRanges(edited, 5)[1]]);
});

test("[MER-16] switches an endpoint between Maghrib offset and clock time", () => {
  expect(switchEndpointKind({ kind: "maghrib", offset: "-30" }, "clock")).toEqual({
    kind: "clock",
    time: "",
  });
  expect(switchEndpointKind({ kind: "clock", time: "21:00" }, "maghrib")).toEqual({
    kind: "maghrib",
    offset: "0",
  });
  const same = { kind: "clock", time: "21:00" } as const;
  expect(switchEndpointKind(same, "clock")).toBe(same);
});

test("[MER-16] turns the suhoor window on with 03:00–04:30 and off again", () => {
  const withSuhoor = toggleRamadanSuhoor(empty, true);
  expect(withSuhoor.suhoor).toEqual({ opens: "03:00", closes: "04:30" });
  expect(toggleRamadanSuhoor(withSuhoor, true)).toBe(withSuhoor);
  expect(toggleRamadanSuhoor(withSuhoor, false).suhoor).toBe(null);
});
