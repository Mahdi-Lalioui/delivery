import { expect, test } from "vitest";
import { addRamadanRange, toRamadanDraft } from "../src/merchant-hours/ramadan-editor";
import {
  initialRamadanState,
  prepareRamadanSave,
  reduceRamadan,
  type RamadanState,
} from "../src/merchant-hours/ramadan-flow";

const sessionId = "019d6abc-1234-7234-8234-123456789001";
const loaded = reduceRamadan(initialRamadanState, {
  kind: "loaded",
  ramadan: { sessionId, revision: 3, schedule: null },
});

function saving(state: RamadanState, idempotencyKey = "key-1") {
  return reduceRamadan(state, { kind: "save-started", idempotencyKey });
}

function withIftar(state: RamadanState) {
  if (state.kind !== "editing") throw new Error("Expected editing");
  return reduceRamadan(state, { kind: "draft-changed", draft: addRamadanRange(state.draft, 1) });
}

test("[MER-16] starts an unsaved schedule closed every day", () => {
  expect(initialRamadanState).toEqual({ kind: "loading" });
  expect(loaded).toEqual({
    kind: "editing",
    sessionId,
    revision: 3,
    draft: toRamadanDraft(null),
    errors: [],
  });
  expect(reduceRamadan(initialRamadanState, { kind: "load-failed", failure: "sign-in" })).toEqual({
    kind: "load-failed",
    failure: "sign-in",
  });
});

test("[MER-16] prepares the contract input with the expected revision", () => {
  const attempt = prepareRamadanSave(withIftar(loaded), () => "key-9");
  expect(attempt).toMatchObject({
    kind: "ready",
    idempotencyKey: "key-9",
    input: { method: "Algeria", adjustmentMinutes: 0, suhoor: null, expectedRevision: 3 },
  });
  expect(prepareRamadanSave(initialRamadanState, () => "key-9")).toEqual({ kind: "unavailable" });
});

test("[MER-16] reports invalid fields without starting a save", () => {
  if (loaded.kind !== "editing") throw new Error("Expected editing");
  const draft = { ...loaded.draft, adjustment: "45" };
  const edited = reduceRamadan(loaded, { kind: "draft-changed", draft });
  const attempt = prepareRamadanSave(edited, () => "key-9");
  expect(attempt).toEqual({ kind: "invalid", errors: [{ field: "adjustment" }] });
  if (attempt.kind !== "invalid") return;
  expect(
    reduceRamadan(edited, { kind: "validation-failed", errors: attempt.errors }),
  ).toMatchObject({ errors: [{ field: "adjustment" }] });
});

test("[MER-16] a saved schedule moves to the new revision with a notice", () => {
  const saved = reduceRamadan(saving(withIftar(loaded)), {
    kind: "save-finished",
    result: { kind: "saved", data: { revision: 4 } },
  });
  expect(saved).toMatchObject({ kind: "editing", revision: 4, notice: "saved" });
});

test("[MER-16] keeps the key only after an uncertain failure and drops it on edit or advance", () => {
  const uncertain = reduceRamadan(saving(loaded), {
    kind: "save-finished",
    result: { kind: "rate-limited", shouldReuseKey: true },
  });
  expect(uncertain).toMatchObject({ retryKey: "key-1", failure: "rate-limited" });
  expect(prepareRamadanSave(uncertain, () => "fresh")).toMatchObject({ idempotencyKey: "key-1" });
  expect(withIftar(uncertain)).not.toHaveProperty("retryKey");
  const advanced = reduceRamadan(uncertain, { kind: "revision-advanced", revision: 5 });
  expect(advanced).toMatchObject({ revision: 5 });
  expect(advanced).not.toHaveProperty("retryKey");
  expect(reduceRamadan(advanced, { kind: "revision-advanced", revision: 4 })).toBe(advanced);
  const rejected = reduceRamadan(saving(loaded), {
    kind: "save-finished",
    result: { kind: "revision-conflict" },
  });
  expect(rejected).toMatchObject({ revision: 3, failure: "revision-conflict" });
  expect(rejected).not.toHaveProperty("retryKey");
});

test("[MER-16] ignores events that do not fit the current state", () => {
  const result = { kind: "saved", data: { revision: 9 } } as const;
  expect(reduceRamadan(loaded, { kind: "save-finished", result })).toBe(loaded);
  const inFlight = saving(loaded);
  expect(saving(inFlight, "key-2")).toBe(inFlight);
  expect(prepareRamadanSave(inFlight, () => "x")).toEqual({ kind: "unavailable" });
});
