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
  expect(
    reduceHours(saved, { kind: "revision-advanced", sessionId, expectedRevision: 4, revision: 5 }),
  ).toMatchObject({ revision: 5, notice: "saved" });
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

test("[MER-15] adopts a newer revision from the closed-now command without losing the draft", () => {
  if (loaded.kind !== "editing") throw new Error("Expected editing");
  const draft = updateHoursRange(loaded.draft, {
    weekday: 1,
    index: 0,
    field: "opens",
    value: "17:00",
  });
  const edited = reduceHours(loaded, { kind: "draft-changed", draft });
  const event = { kind: "revision-advanced", sessionId, expectedRevision: 3, revision: 4 } as const;
  const advanced = reduceHours(edited, event);
  expect(advanced).toEqual({ kind: "editing", sessionId, revision: 4, draft, errors: [] });
  expect(reduceHours(advanced, event)).toBe(advanced);
  expect(reduceHours(initialHoursState, event)).toBe(initialHoursState);
});

test.each([
  { sessionId, expectedRevision: 4, revision: 5 },
  { sessionId: "different-session", expectedRevision: 3, revision: 4 },
])(
  "[MER-15] keeps a dated-exception draft on its own revision after an unrelated save",
  (change) => {
    if (loaded.kind !== "editing") throw new Error("Expected editing");
    const specialDates = [{ id: "fixture", date: "2027-01-01", ranges: [] }];
    const edited = reduceHours(loaded, {
      kind: "draft-changed",
      draft: { ...loaded.draft, specialDates },
    });
    const afterSave = reduceHours(edited, { kind: "revision-advanced", ...change });
    expect(prepareHoursSave(afterSave, () => "draft-key")).toMatchObject({
      input: { expectedRevision: 3, specialDates: [{ date: "2027-01-01", ranges: [] }] },
    });
  },
);

test("[MER-15] drops a held retry key once the revision advances", () => {
  const uncertain = reduceHours(saving(loaded), {
    kind: "save-finished",
    result: { kind: "error", shouldReuseKey: true },
  });
  expect(uncertain).toMatchObject({ retryKey: "key-1" });
  const advanced = reduceHours(uncertain, {
    kind: "revision-advanced",
    sessionId,
    expectedRevision: 3,
    revision: 4,
  });
  expect(advanced).not.toHaveProperty("retryKey");
  expect(advanced).not.toHaveProperty("failure");
  expect(prepareHoursSave(advanced, () => "key-7")).toMatchObject({
    idempotencyKey: "key-7",
    input: { expectedRevision: 4 },
  });
});

test("[MER-15] saves dated exceptions with the week and retries only an unchanged draft", () => {
  if (loaded.kind !== "editing") throw new Error("Expected editing");
  const draft = {
    ...loaded.draft,
    specialDates: [{ id: "fixture", date: "2027-01-01", ranges: [] }],
  };
  const edited = reduceHours(loaded, { kind: "draft-changed", draft });
  const attempt = prepareHoursSave(edited, () => "first-attempt");
  expect(attempt).toEqual({
    kind: "ready",
    idempotencyKey: "first-attempt",
    input: { expectedRevision: 3, weekly, specialDates: [{ date: "2027-01-01", ranges: [] }] },
  });
  const uncertain = reduceHours(saving(edited, "first-attempt"), {
    kind: "save-finished",
    result: { kind: "error", shouldReuseKey: true },
  });
  expect(prepareHoursSave(uncertain, () => "new-key")).toEqual(attempt);
  const reopened = reduceHours(uncertain, {
    kind: "draft-changed",
    draft: { ...draft, specialDates: [] },
  });
  expect(prepareHoursSave(reopened, () => "new-key")).toEqual({
    kind: "ready",
    idempotencyKey: "new-key",
    input: { expectedRevision: 3, weekly, specialDates: [] },
  });
});
