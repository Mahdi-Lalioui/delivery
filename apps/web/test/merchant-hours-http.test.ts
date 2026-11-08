import { afterEach, expect, test, vi } from "vitest";
import {
  readHours,
  readHoursPreview,
  readRamadan,
  replaceHours,
  replaceRamadan,
  setHoursPause,
  type HoursInput,
  type RamadanInput,
} from "../src/merchant-hours/hours-http";

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const endpoint = `/v1/merchants/${merchantId}/hours`;
const signal = new AbortController().signal;
const privateRequest = { cache: "no-store", credentials: "same-origin", redirect: "error" };
const weekly = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  ranges: weekday === 5 ? [] : [{ opensMinute: 1080, closesMinute: 120 }],
}));
const hours = { weekly, specialDates: [] } satisfies HoursInput;
const ramadan = {
  weekly: weekly.map(({ weekday }) => ({ weekday, ranges: [] })),
  suhoor: { opensMinute: 180, closesMinute: 270 },
  method: "Algeria",
  adjustmentMinutes: 0,
} satisfies RamadanInput;
const day = {
  date: "2027-02-08",
  source: "weekly",
  maghribAt: null,
  intervals: [{ opensAt: "2027-02-08T17:00:00.000Z", closesAt: "2027-02-09T01:00:00.000Z" }],
};
const commandHeaders = {
  "Content-Type": "application/json",
  "Idempotency-Key": "key-1",
  "x-expected-session-id": sessionId,
};

function problem(status: number, code: string) {
  return Response.json(
    { type: "about:blank", title: "Problem", status, code, requestId: "request-1" },
    { status, headers: { "content-type": "application/problem+json" } },
  );
}

afterEach(() => vi.unstubAllGlobals());

test("[MER-15] reads the stored week with the session and revision", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ sessionId, revision: 3, ...hours }));
  vi.stubGlobal("fetch", fetch);
  await expect(readHours({ merchantId, signal })).resolves.toEqual({
    kind: "ready",
    data: { sessionId, revision: 3, ...hours },
  });
  expect(fetch).toHaveBeenCalledExactlyOnceWith(endpoint, { signal, ...privateRequest });
});

test("[MER-15] replaces the week as a session-bound idempotent command", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ revision: 4 }));
  vi.stubGlobal("fetch", fetch);
  const input = { ...hours, expectedRevision: 3 };
  await expect(
    replaceHours({ merchantId, sessionId, idempotencyKey: "key-1", input }),
  ).resolves.toEqual({ kind: "saved", data: { revision: 4 } });
  expect(fetch).toHaveBeenCalledExactlyOnceWith(endpoint, {
    method: "PUT",
    headers: commandHeaders,
    body: JSON.stringify(input),
    ...privateRequest,
  });
});

test("[MER-16] reads and replaces the Ramadan schedule", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ sessionId, revision: 4, schedule: null }))
    .mockResolvedValueOnce(Response.json({ revision: 5 }));
  vi.stubGlobal("fetch", fetch);
  await expect(readRamadan({ merchantId, signal })).resolves.toEqual({
    kind: "ready",
    data: { sessionId, revision: 4, schedule: null },
  });
  const input = { ...ramadan, expectedRevision: 4 };
  await expect(
    replaceRamadan({ merchantId, sessionId, idempotencyKey: "key-1", input }),
  ).resolves.toEqual({ kind: "saved", data: { revision: 5 } });
  expect(fetch).toHaveBeenLastCalledWith(endpoint + "/ramadan", {
    method: "PUT",
    headers: commandHeaders,
    body: JSON.stringify(input),
    ...privateRequest,
  });
});

test("[MER-15] sets the closed-now override and maps a past instant", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ revision: 6 }))
    .mockResolvedValueOnce(problem(400, "pause_not_in_future"));
  vi.stubGlobal("fetch", fetch);
  const input = { pausedUntil: "2027-02-08T20:00:00.000Z", expectedRevision: 5 };
  await expect(
    setHoursPause({ merchantId, sessionId, idempotencyKey: "key-1", input }),
  ).resolves.toEqual({ kind: "saved", data: { revision: 6 } });
  expect(fetch).toHaveBeenCalledWith(endpoint + "/pause", {
    method: "PUT",
    headers: commandHeaders,
    body: JSON.stringify(input),
    ...privateRequest,
  });
  await expect(
    setHoursPause({ merchantId, sessionId, idempotencyKey: "key-2", input }),
  ).resolves.toEqual({ kind: "pause-in-past" });
});

test("[MER-16] reads the seven-day preview for the requested schedule", async () => {
  const days = Array.from({ length: 7 }, () => day);
  const fetch = vi.fn().mockResolvedValue(Response.json({ schedule: "ramadan", days }));
  vi.stubGlobal("fetch", fetch);
  await expect(readHoursPreview({ merchantId, schedule: "ramadan", signal })).resolves.toEqual({
    kind: "ready",
    data: { schedule: "ramadan", days },
  });
  expect(fetch).toHaveBeenCalledExactlyOnceWith(endpoint + "/preview?schedule=ramadan", {
    signal,
    ...privateRequest,
  });
});

test("[MER-16] refuses a preview for a schedule other than the one requested", async () => {
  const days = Array.from({ length: 7 }, () => day);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ schedule: "regular", days })));
  await expect(readHoursPreview({ merchantId, schedule: "ramadan", signal })).resolves.toEqual({
    kind: "error",
  });
});

test.each([
  [problem(401, "unauthorized"), { kind: "sign-in" }],
  [problem(403, "forbidden"), { kind: "forbidden" }],
  [problem(404, "not_found"), { kind: "forbidden" }],
  [problem(409, "session_changed"), { kind: "session-changed" }],
  [problem(409, "revision_conflict"), { kind: "revision-conflict" }],
  [problem(409, "idempotency_conflict"), { kind: "error", shouldReuseKey: false }],
  [problem(400, "validation_failed"), { kind: "invalid-hours" }],
  [problem(429, "rate_limited"), { kind: "rate-limited", shouldReuseKey: true }],
  [problem(503, "unavailable"), { kind: "error", shouldReuseKey: true }],
  [Response.json({ revision: "four" }), { kind: "error", shouldReuseKey: true }],
])("[MER-15] classifies a failed replace as %#", async (response, expected) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  const input = { ...hours, expectedRevision: 3 };
  await expect(
    replaceHours({ merchantId, sessionId, idempotencyKey: "key-1", input }),
  ).resolves.toEqual(expected);
});

test("[MER-15] keeps the retry key after a network failure and reports read errors", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  const input = { ...hours, expectedRevision: 3 };
  await expect(
    replaceHours({ merchantId, sessionId, idempotencyKey: "key-1", input }),
  ).resolves.toEqual({ kind: "error", shouldReuseKey: true });
  await expect(readHours({ merchantId, signal })).resolves.toEqual({ kind: "error" });
});
