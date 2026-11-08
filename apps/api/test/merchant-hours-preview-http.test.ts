import { merchantHoursPreviewOutput } from "@zaafran/contracts/merchant-hours";
import type { createMerchantHoursRepository } from "@zaafran/db/merchant-hours";
import { calculateMaghrib } from "@zaafran/geo/maghrib";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { Actor } from "../src/policy.ts";

type Repository = ReturnType<typeof createMerchantHoursRepository>;
type Schedule = NonNullable<Awaited<ReturnType<Repository["readSchedule"]>>>;

// 12:00 in Algiers on Monday 2027-02-08.
const now = new Date("2027-02-08T11:00:00.000Z");
const accountId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343003";
const owner = { role: "merchant_owner", accountId, sessionId } as const;
const path = "/v1/merchants/" + merchantId + "/hours/preview";
const coordinates = { latitude: 36.765, longitude: 3.05 };
const dates = ["08", "09", "10", "11", "12", "13", "14"].map((day) => "2027-02-" + day);
const emptyWeek = Array.from({ length: 7 }, (_, weekday) => ({ weekday, ranges: [] }));
const regular: Schedule = {
  hours: {
    weekly: emptyWeek.map((day) =>
      day.weekday === 1 ? { weekday: 1, ranges: [{ opensMinute: 1080, closesMinute: 120 }] } : day,
    ),
    specialDates: [{ date: "2027-02-10", ranges: [{ opensMinute: 600, closesMinute: 720 }] }],
  },
  ramadan: null,
  pausedUntil: "2027-02-08T17:30:00.000Z",
  coordinates,
};
const ramadan: Schedule["ramadan"] = {
  weekly: emptyWeek.map((day) =>
    day.weekday === 1
      ? {
          weekday: 1,
          ranges: [
            {
              opens: { kind: "maghrib", minutes: -60 },
              closes: { kind: "clock", minuteOfDay: 120 },
            },
          ],
        }
      : day,
  ),
  suhoor: null,
  method: "Algeria",
  adjustmentMinutes: 2,
};

function setup(actor?: Actor) {
  const repository = { readSchedule: vi.fn<Repository["readSchedule"]>() };
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve(actor),
    merchantHoursPreview: { repository, now: () => now },
  });
  onTestFinished(() => api.close());
  return { api, repository };
}

test("[MER-15:http] previews seven regular days with the overnight range and closed-now cut", async () => {
  const { api, repository } = setup(owner);
  repository.readSchedule.mockResolvedValue(regular);
  const result = await api.inject({ method: "GET", url: path + "?schedule=regular" });
  expect(result.statusCode).toBe(200);
  expect(result.headers["cache-control"]).toBe("no-store");
  const { schedule, days } = merchantHoursPreviewOutput.parse(result.json());
  expect(schedule).toBe("regular");
  expect(days.map(({ date }) => date)).toEqual(dates);
  expect(days[0]).toEqual({
    date: "2027-02-08",
    source: "weekly",
    maghribAt: null,
    intervals: [{ opensAt: "2027-02-08T17:30:00.000Z", closesAt: "2027-02-09T01:00:00.000Z" }],
  });
  expect(days[2]?.source).toBe("special");
  expect(repository.readSchedule).toHaveBeenCalledExactlyOnceWith({ accountId, merchantId });
});

test("[MER-16:http] resolves the Ramadan preview from Maghrib at the stored location", async () => {
  const { api, repository } = setup(owner);
  repository.readSchedule.mockResolvedValue({ ...regular, ramadan, pausedUntil: null });
  const result = await api.inject({ method: "GET", url: path + "?schedule=ramadan" });
  expect(result.statusCode).toBe(200);
  const { days } = merchantHoursPreviewOutput.parse(result.json());
  const maghribAt = calculateMaghrib({ date: dates[0] ?? "", coordinates, adjustmentMinutes: 2 });
  if (maghribAt === null) throw new Error("Expected a Maghrib instant");
  expect(days[0]).toEqual({
    date: "2027-02-08",
    source: "ramadan",
    maghribAt: new Date(maghribAt).toISOString(),
    intervals: [
      {
        opensAt: new Date(maghribAt - 60 * 60_000).toISOString(),
        closesAt: "2027-02-09T01:00:00.000Z",
      },
    ],
  });
  expect(days.map(({ source }) => source)).toEqual([
    "ramadan",
    "ramadan",
    "special",
    "ramadan",
    "ramadan",
    "ramadan",
    "ramadan",
  ]);
  expect(days[1]?.maghribAt).not.toBeNull();
});

test("[MER-16:http] falls back to the regular week before a Ramadan schedule is saved", async () => {
  const { api, repository } = setup(owner);
  repository.readSchedule.mockResolvedValue(regular);
  const result = await api.inject({ method: "GET", url: path + "?schedule=ramadan" });
  expect(result.statusCode).toBe(200);
  const { schedule, days } = merchantHoursPreviewOutput.parse(result.json());
  expect(schedule).toBe("ramadan");
  expect(days[0]?.source).toBe("weekly");
});

test("[MER-15:http] hides the preview from non-managers and rejects an unknown schedule", async () => {
  const { api, repository } = setup(owner);
  repository.readSchedule.mockResolvedValue(undefined);
  const hidden = await api.inject({ method: "GET", url: path + "?schedule=regular" });
  expect(hidden.statusCode).toBe(404);
  expect(hidden.json()).toMatchObject({ code: "not_found" });
  const invalid = await api.inject({ method: "GET", url: path + "?schedule=summer" });
  expect(invalid.statusCode).toBe(400);
  expect(repository.readSchedule).toHaveBeenCalledOnce();
});
