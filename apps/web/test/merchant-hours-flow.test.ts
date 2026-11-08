import { expect, test } from "vitest";
import { toHoursDraft, updateHoursRange } from "../src/merchant-hours/hours-editor";
import {
  initialHoursState,
  prepareHoursSave,
  reduceHours,
  type HoursState,
} from "../src/merchant-hours/hours-flow";

const sessionId = "019d6abc-1234-7234-8234-123456789001";
const weekly = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  ranges: weekday === 1 ? [{ opensMinute: 1080, closesMinute: 120 }] : [],
}));
const stored = { sessionId, revision: 3, weekly, specialDates: [] };
const loaded = reduceHours(initialHoursState, { kind: "loaded", hours: stored });
const keys = ["key-1", "key-2"];

function nextKey() {
  const key = keys.shift();
  if (!key) throw new Error("Out of keys");
  return key;
}

function saving(state: HoursState, idempotencyKey = "key-1") {
  return reduceHours(state, { kind: "save-started", idempotencyKey });
}

test("[MER-15] loads the stored week into an editable draft", () => {
  expect(initialHoursState).toEqual({ kind: "loading" });
  expect(loaded).toEqual({
    kind: "editing",
    sessionId,
    revision: 3,
    draft: toHoursDraft(stored),
    errors: [],
  });
  expect(reduceHours(initialHoursState, { kind: "load-failed", failure: "forbidden" })).toEqual({
    kind: "load-failed",
    failure: "forbidden",
  });
});

test("[MER-15] prepares a save with the expected revision and a fresh key", () => {
  expect(prepareHoursSave(loaded, () => "key-9")).toEqual({
    kind: "ready",
    idempotencyKey: "key-9",
    input: { weekly, specialDates: [], expectedRevision: 3 },
  });
  expect(prepareHoursSave(initialHoursState, nextKey)).toEqual({ kind: "unavailable" });
});

test("[MER-15] reports invalid days without starting a save", () => {
  if (loaded.kind !== "editing") throw new Error("Expected editing");
  const draft = updateHoursRange(loaded.draft, {
    weekday: 1,
    index: 0,
    field: "closes",
    value: "",
  });
  const edited = reduceHours(loaded, { kind: "draft-changed", draft });
  const attempt = prepareHoursSave(edited, nextKey);
  expect(attempt).toEqual({ kind: "invalid", errors: [{ weekday: 1, reason: "time" }] });
  if (attempt.kind !== "invalid") return;
  expect(reduceHours(edited, { kind: "validation-failed", errors: attempt.errors })).toMatchObject({
    kind: "editing",
    errors: [{ weekday: 1, reason: "time" }],
  });
});

test("[MER-15] a saved week moves to the new revision and shows the notice", () => {
  const saved = reduceHours(saving(loaded), {
    kind: "save-finished",
    result: { kind: "saved", data: { revision: 4 } },
  });
  expect(saved).toMatchObject({ kind: "editing", revision: 4, notice: "saved", errors: [] });
  expect(saved).not.toHaveProperty("retryKey");
});

test("[MER-15] keeps the key only after an uncertain failure and drops it on edit", () => {
  const uncertain = reduceHours(saving(loaded), {
    kind: "save-finished",
    result: { kind: "error", shouldReuseKey: true },
  });
  expect(uncertain).toMatchObject({ kind: "editing", retryKey: "key-1", failure: "error" });
  expect(prepareHoursSave(uncertain, () => "fresh")).toMatchObject({ idempotencyKey: "key-1" });
  if (uncertain.kind !== "editing") throw new Error("Expected editing");
  const edited = reduceHours(uncertain, { kind: "draft-changed", draft: uncertain.draft });
  expect(edited).not.toHaveProperty("retryKey");
  expect(edited).not.toHaveProperty("failure");
});

test.each(["revision-conflict", "session-changed", "forbidden"] as const)(
  "[MER-15] keeps the draft and reports a %s rejection",
  (failure) => {
    const rejected = reduceHours(saving(loaded), {
      kind: "save-finished",
      result: { kind: failure },
    });
    expect(rejected).toMatchObject({ kind: "editing", revision: 3, failure });
    expect(rejected).not.toHaveProperty("retryKey");
  },
);

test("[MER-15] ignores events that do not fit the current state", () => {
  const result = { kind: "saved", data: { revision: 9 } } as const;
  expect(reduceHours(loaded, { kind: "save-finished", result })).toBe(loaded);
  const inFlight = saving(loaded);
  expect(saving(inFlight, "key-2")).toBe(inFlight);
  expect(reduceHours(inFlight, { kind: "draft-changed", draft: toHoursDraft(stored) })).toBe(
    inFlight,
  );
  expect(prepareHoursSave(inFlight, nextKey)).toEqual({ kind: "unavailable" });
});
