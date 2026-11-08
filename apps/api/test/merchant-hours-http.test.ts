import { merchantHoursOutput, merchantHoursWriteOutput } from "@zaafran/contracts/merchant-hours";
import type { createMerchantHoursRepository } from "@zaafran/db/merchant-hours";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { Actor } from "../src/policy.ts";

type Repository = ReturnType<typeof createMerchantHoursRepository>;

const now = new Date("2026-11-08T02:00:00.000Z");
const accountId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343003";
const owner = { role: "merchant_owner", accountId, sessionId } as const;
const staff = { ...owner, role: "merchant_staff" } as const;
const path = "/v1/merchants/" + merchantId + "/hours";
const headers = { "idempotency-key": "fixture-hours", "x-expected-session-id": sessionId };
const weekly = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  ranges: weekday === 5 ? [] : [{ opensMinute: 1080, closesMinute: 120 }],
}));
const hours = { weekly, specialDates: [{ date: "2026-12-31", ranges: [] }] };

function setup(actor?: Actor) {
  const repository = {
    read: vi.fn<Repository["read"]>(),
    replace: vi.fn<Repository["replace"]>(),
    readRamadan: vi.fn<Repository["readRamadan"]>(),
    replaceRamadan: vi.fn<Repository["replaceRamadan"]>(),
    readPause: vi.fn<Repository["readPause"]>(),
    pause: vi.fn<Repository["pause"]>(),
  } satisfies Repository;
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve(actor),
    merchantHours: { repository, now: () => now },
  });
  onTestFinished(() => api.close());
  return { api, repository };
}

test("[MER-15:http] reads the stored hours with the session and menu revision", async () => {
  const { api, repository } = setup(owner);
  repository.read.mockResolvedValue({ revision: 3, ...hours });
  const result = await api.inject({ method: "GET", url: path });
  expect(result.statusCode).toBe(200);
  expect(result.headers["cache-control"]).toBe("no-store");
  expect(merchantHoursOutput.parse(result.json())).toEqual({ sessionId, revision: 3, ...hours });
  expect(repository.read).toHaveBeenCalledExactlyOnceWith({ accountId, merchantId });
});

test("[MER-15:http] hides hours the actor cannot manage", async () => {
  const { api, repository } = setup(owner);
  repository.read.mockResolvedValue(undefined);
  const result = await api.inject({ method: "GET", url: path });
  expect(result.statusCode).toBe(404);
  expect(result.json()).toMatchObject({ code: "not_found" });
});

test("[MER-15:http] replaces hours once per key and returns the new revision", async () => {
  const { api, repository } = setup(owner);
  repository.replace.mockResolvedValue({ kind: "applied", revision: 4 });
  const payload = { ...hours, expectedRevision: 3 };
  const result = await api.inject({ method: "PUT", url: path, headers, payload });
  expect(result.statusCode).toBe(200);
  expect(merchantHoursWriteOutput.parse(result.json())).toEqual({ revision: 4 });
  const call = repository.replace.mock.calls[0]?.[0];
  expect(call).toMatchObject({ accountId, merchantId, input: payload, now });
  expect(call?.idempotencyKeyHash).toHaveLength(32);
  expect(call?.requestHash).toHaveLength(32);
});

test.each([
  ["revision_conflict", 409],
  ["idempotency_conflict", 409],
  ["not_found", 404],
] as const)("[MER-15:http] maps a %s replace to %i", async (kind, status) => {
  const { api, repository } = setup(owner);
  repository.replace.mockResolvedValue({ kind });
  const payload = { ...hours, expectedRevision: 3 };
  const result = await api.inject({ method: "PUT", url: path, headers, payload });
  expect(result.statusCode).toBe(status);
  expect(result.json()).toMatchObject({ code: kind });
});

test("[MER-15:http] rejects overlapping ranges, a changed session and staff", async () => {
  const { api, repository } = setup(owner);
  const overlapping = weekly.map((day) =>
    day.weekday === 0
      ? {
          weekday: 0,
          ranges: [
            { opensMinute: 600, closesMinute: 900 },
            { opensMinute: 800, closesMinute: 1000 },
          ],
        }
      : day,
  );
  const invalid = await api.inject({
    method: "PUT",
    url: path,
    headers,
    payload: { weekly: overlapping, specialDates: [], expectedRevision: 3 },
  });
  expect(invalid.statusCode).toBe(400);
  const changed = await api.inject({
    method: "PUT",
    url: path,
    headers: { ...headers, "x-expected-session-id": merchantId },
    payload: { ...hours, expectedRevision: 3 },
  });
  expect(changed.statusCode).toBe(409);
  expect(changed.json()).toMatchObject({ code: "session_changed" });
  expect(repository.replace).not.toHaveBeenCalled();

  const denied = setup(staff);
  const forbidden = await denied.api.inject({ method: "GET", url: path });
  expect(forbidden.statusCode).toBe(403);
  expect(denied.repository.read).not.toHaveBeenCalled();
});

const ramadan = {
  weekly: weekly.map(({ weekday }) => ({
    weekday,
    ranges: [
      {
        opens: { kind: "maghrib" as const, minutes: -60 },
        closes: { kind: "clock" as const, minuteOfDay: 120 },
      },
    ],
  })),
  suhoor: { opensMinute: 0, closesMinute: 240 },
  method: "Algeria",
  adjustmentMinutes: 2,
};

test("[MER-16:http] reads a missing Ramadan schedule as null and a stored one whole", async () => {
  const { api, repository } = setup(owner);
  repository.readRamadan.mockResolvedValueOnce({ revision: 0, schedule: null });
  repository.readRamadan.mockResolvedValueOnce({ revision: 2, schedule: ramadan });
  const empty = await api.inject({ method: "GET", url: path + "/ramadan" });
  expect(empty.statusCode).toBe(200);
  expect(empty.headers["cache-control"]).toBe("no-store");
  expect(empty.json()).toEqual({ sessionId, revision: 0, schedule: null });
  const stored = await api.inject({ method: "GET", url: path + "/ramadan" });
  expect(stored.json()).toEqual({ sessionId, revision: 2, schedule: ramadan });
  repository.readRamadan.mockResolvedValueOnce(undefined);
  expect((await api.inject({ method: "GET", url: path + "/ramadan" })).statusCode).toBe(404);
});

test("[MER-16:http] replaces the Ramadan schedule and rejects an unknown method", async () => {
  const { api, repository } = setup(owner);
  repository.replaceRamadan.mockResolvedValueOnce({ kind: "applied", revision: 3 });
  repository.replaceRamadan.mockResolvedValueOnce({ kind: "revision_conflict" });
  const payload = { ...ramadan, expectedRevision: 2 };
  const applied = await api.inject({ method: "PUT", url: path + "/ramadan", headers, payload });
  expect(applied.statusCode).toBe(200);
  expect(applied.json()).toEqual({ revision: 3 });
  expect(repository.replaceRamadan.mock.calls[0]?.[0]).toMatchObject({
    accountId,
    merchantId,
    input: payload,
    now,
  });
  const stale = await api.inject({ method: "PUT", url: path + "/ramadan", headers, payload });
  expect(stale.statusCode).toBe(409);
  expect(stale.json()).toMatchObject({ code: "revision_conflict" });
  const invalid = await api.inject({
    method: "PUT",
    url: path + "/ramadan",
    headers,
    payload: { ...payload, method: "Other" },
  });
  expect(invalid.statusCode).toBe(400);
  expect(repository.replaceRamadan).toHaveBeenCalledTimes(2);
});
