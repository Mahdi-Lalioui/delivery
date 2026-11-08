import { expect, test } from "vitest";
import {
  initialPauseState,
  isPausedAt,
  pauseFocusSelector,
  pauseInstant,
  preparePause,
  reducePause,
} from "../src/merchant-hours/hours-pause";

const now = Date.parse("2026-11-08T19:15:00.000Z");
const paused = { kind: "ready" as const, pausedUntil: "2026-11-08T20:15:00.000Z" };

test("[MER-15] closes for an exact number of minutes from the injected clock", () => {
  expect(pauseInstant(now, 30)).toBe("2026-11-08T19:45:00.000Z");
  expect(pauseInstant(now, 120)).toBe("2026-11-08T21:15:00.000Z");
});

test("[MER-15] is closed only strictly before the stored instant", () => {
  expect(isPausedAt(null, now)).toBe(false);
  expect(isPausedAt("2026-11-08T19:15:00.000Z", now)).toBe(false);
  expect(isPausedAt("2026-11-08T19:15:01.000Z", now)).toBe(true);
});

test("[MER-15] loads the stored instant and reports a failed read", () => {
  expect(initialPauseState).toEqual({ kind: "loading" });
  expect(
    reducePause(initialPauseState, { kind: "loaded", pausedUntil: paused.pausedUntil }),
  ).toEqual(paused);
  expect(reducePause(initialPauseState, { kind: "load-failed" })).toEqual({ kind: "unavailable" });
});

test("[MER-15] prepares a closing command with a fresh key and the expected revision", () => {
  const ready = { kind: "ready" as const, pausedUntil: null };
  expect(preparePause(ready, { pausedUntil: paused.pausedUntil, revision: 4 }, () => "k1")).toEqual(
    { idempotencyKey: "k1", input: { pausedUntil: paused.pausedUntil, expectedRevision: 4 } },
  );
  expect(preparePause(initialPauseState, { pausedUntil: null, revision: 4 }, () => "k1")).toBe(
    undefined,
  );
});

test("[MER-15] records the new instant after a saved command", () => {
  const command = { idempotencyKey: "k1", input: { pausedUntil: null, expectedRevision: 4 } };
  const saving = reducePause(paused, { kind: "save-started", command });
  expect(saving).toEqual({ kind: "saving", pausedUntil: paused.pausedUntil, command });
  expect(preparePause(saving, { pausedUntil: null, revision: 4 }, () => "k2")).toBe(undefined);
  expect(
    reducePause(saving, {
      kind: "save-finished",
      result: { kind: "saved", data: { revision: 5 } },
    }),
  ).toEqual({ kind: "ready", pausedUntil: null, notice: "saved" });
});

test("[MER-15] resends the exact command only after an uncertain failure", () => {
  const command = {
    idempotencyKey: "k1",
    input: { pausedUntil: paused.pausedUntil, expectedRevision: 4 },
  };
  const saving = reducePause(paused, { kind: "save-started", command });
  const uncertain = reducePause(saving, {
    kind: "save-finished",
    result: { kind: "rate-limited", shouldReuseKey: true },
  });
  expect(uncertain).toEqual({
    kind: "ready",
    pausedUntil: paused.pausedUntil,
    failure: "rate-limited",
    retry: command,
  });
  const sameTarget = { pausedUntil: paused.pausedUntil, revision: 4 };
  expect(preparePause(uncertain, sameTarget, () => "k2")).toEqual(command);
  expect(preparePause(uncertain, { pausedUntil: null, revision: 4 }, () => "k2")).toEqual({
    idempotencyKey: "k2",
    input: { pausedUntil: null, expectedRevision: 4 },
  });
  const rejected = reducePause(saving, {
    kind: "save-finished",
    result: { kind: "pause-in-past" },
  });
  expect(rejected).toEqual({
    kind: "ready",
    pausedUntil: paused.pausedUntil,
    failure: "pause-in-past",
  });
});

test("[MER-15] ignores events that do not fit the current state", () => {
  const result = { kind: "saved" as const, data: { revision: 5 } };
  expect(reducePause(paused, { kind: "save-finished", result })).toBe(paused);
  const command = { idempotencyKey: "k1", input: { pausedUntil: null, expectedRevision: 4 } };
  expect(reducePause(initialPauseState, { kind: "save-started", command })).toBe(initialPauseState);
});

test("[MER-15] restores focus to the control that fits the settled closed-now state", () => {
  const command = { idempotencyKey: "k1", input: { pausedUntil: null, expectedRevision: 4 } };
  expect(pauseFocusSelector({ kind: "ready", pausedUntil: null })).toBe('[data-pause-close="30"]');
  expect(pauseFocusSelector(paused)).toBe("[data-pause-reopen]");
  expect(pauseFocusSelector({ ...paused, failure: "error", retry: command })).toBe(
    "[data-pause-retry]",
  );
  expect(pauseFocusSelector({ ...paused, failure: "session-changed" })).toBe("[data-hours-reload]");
  expect(pauseFocusSelector({ kind: "unavailable" })).toBe(undefined);
});
