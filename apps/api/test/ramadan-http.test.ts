import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";

const communeId = "01932f18-3150-7c33-8a7a-53acfd343001";
const path = "/v1/ramadan/today?communeId=" + communeId;

function setup() {
  const isRamadanEnabled = vi.fn<() => Promise<boolean>>();
  const findCoordinates =
    vi.fn<(id: string) => Promise<{ latitude: number; longitude: number } | undefined>>();
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    ramadan: {
      isRamadanEnabled,
      findCoordinates,
      now: () => new Date("2027-02-08T23:15:00Z"),
    },
  });
  onTestFinished(() => api.close());
  return { api, isRamadanEnabled, findCoordinates };
}

test("[HRS-03:http] turns off the countdown without a commune lookup", async () => {
  const { api, isRamadanEnabled, findCoordinates } = setup();
  isRamadanEnabled.mockResolvedValue(false);
  const response = await api.inject(path);
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ isRamadan: false, maghribAt: null });
  expect(findCoordinates).not.toHaveBeenCalled();
});

test("[HRS-03:http] computes local-day Maghrib at the chosen commune", async () => {
  const { api, isRamadanEnabled, findCoordinates } = setup();
  isRamadanEnabled.mockResolvedValue(true);
  findCoordinates.mockResolvedValue({ latitude: 36.7538, longitude: 3.0588 });
  const response = await api.inject(path);
  expect(response.statusCode).toBe(200);
  expect(findCoordinates).toHaveBeenCalledWith(communeId);
  const value = response.json<{ isRamadan: boolean; maghribAt: string }>();
  expect(value.isRamadan).toBe(true);
  const reference = Date.parse("2027-02-09T18:24:00+01:00");
  expect(Math.abs(Date.parse(value.maghribAt) - reference)).toBeLessThanOrEqual(120_000);
  expect(response.headers["cache-control"]).toBe("no-store");
});

test("[HRS-03:http] rejects invalid and unknown communes", async () => {
  const { api, isRamadanEnabled, findCoordinates } = setup();
  isRamadanEnabled.mockResolvedValue(true);
  findCoordinates.mockResolvedValue(undefined);
  expect((await api.inject("/v1/ramadan/today?communeId=bogus")).statusCode).toBe(400);
  expect((await api.inject(path)).statusCode).toBe(404);
});
