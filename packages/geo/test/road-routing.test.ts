import { expect, test, vi } from "vitest";
import { createRoadRouter } from "../src/road-routing.ts";

const from = { latitude: 36.75, longitude: 3.06 };
const to = { latitude: 36.76, longitude: 3.065 };
const origin = "http://osrm.internal:5000";
const response = () =>
  Response.json({
    code: "Ok",
    routes: [
      {
        distance: 1_845,
        duration: 338,
        geometry: {
          type: "LineString",
          coordinates: [
            [3.06, 36.75],
            [3.065, 36.76],
          ],
        },
      },
    ],
  });

test("[GEO-03] reads an OSRM route with metre, second and longitude-first coordinates", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
  const estimate = createRoadRouter({ origin, fetcher });
  expect(await estimate(from, to)).toEqual({
    distanceM: 1_845,
    durationSeconds: 338,
    points: [from, to],
  });
  const request = fetcher.mock.calls[0]?.[0];
  expect(request instanceof URL ? request.href : request).toBe(
    origin + "/route/v1/driving/3.06,36.75;3.065,36.76?overview=simplified&geometries=geojson",
  );
});

test("[GEO-03] backs off after three failures, then probes and restores routing", async () => {
  let now = 1_000;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(Response.json({}, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ code: "Ok", routes: [] }))
    .mockResolvedValueOnce(response());
  const estimate = createRoadRouter({ origin, fetcher, now: () => now });
  for (let i = 0; i < 4; i++) {
    const result = await estimate(from, to);
    expect(result.points).toBeNull();
    expect(result.distanceM).toBeGreaterThan(1_500);
  }
  expect(fetcher).toHaveBeenCalledTimes(3);
  now += 59_999;
  expect((await estimate(from, to)).points).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(3);
  now++;
  expect((await estimate(from, to)).points).toEqual([from, to]);
  expect(fetcher).toHaveBeenCalledTimes(4);
});
