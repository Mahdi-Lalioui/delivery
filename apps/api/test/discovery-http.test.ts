import type { discoveryLocationInput, discoveryLocationOutput } from "@zaafran/contracts/discovery";
import { expect, onTestFinished, test, vi } from "vitest";
import type { z } from "zod";
import { createApi } from "../src/app.ts";

const url = "/v1/geo/serviceability";
const communeId = "01932f18-3150-7c33-8a7a-53acfd343001";
const serviceAreaId = "01932f18-3150-7c33-8a7a-53acfd343002";
const point = { latitude: 36.76, longitude: 3.05 };

function setup(max = 120) {
  const resolve =
    vi.fn<
      (
        input: z.infer<typeof discoveryLocationInput>,
      ) => Promise<z.infer<typeof discoveryLocationOutput> | undefined>
    >();
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    discovery: { resolve },
    rateLimit: { max, timeWindow: 60_000 },
  });
  onTestFinished(() => api.close());
  return { api, resolve };
}

test("[CUS-02:http] resolves anonymous commune selection without caching", async () => {
  const { api, resolve } = setup();
  const result = { ...point, communeId, serviceAreaId };
  resolve.mockResolvedValue(result);
  const response = await api.inject({
    method: "POST",
    url,
    payload: { kind: "commune", communeId: communeId.toUpperCase() },
  });
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.json()).toEqual(result);
  expect(resolve).toHaveBeenCalledExactlyOnceWith({ kind: "commune", communeId });
});

test("[GEO-01:http] keeps outside-area points browsable and rejects unknown communes", async () => {
  const { api, resolve } = setup();
  const outside = { ...point, communeId: null, serviceAreaId: null };
  resolve.mockResolvedValueOnce(outside);
  const response = await api.inject({ method: "POST", url, payload: { kind: "point", ...point } });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual(outside);
  const unknown = await api.inject({
    method: "POST",
    url,
    payload: { kind: "commune", communeId },
  });
  expect(unknown.statusCode).toBe(404);
});

test("[GEO-02:http] rejects malformed coordinates before querying geography", async () => {
  const { api, resolve } = setup();
  const response = await api.inject({
    method: "POST",
    url,
    payload: { kind: "point", ...point, latitude: 91 },
  });
  expect(response.statusCode).toBe(400);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(resolve).not.toHaveBeenCalled();
});

test("[GEO-02:http] applies no-store even when rate limiting short-circuits the lookup", async () => {
  const { api, resolve } = setup(1);
  resolve.mockResolvedValue({ ...point, communeId: null, serviceAreaId: null });
  const request = { method: "POST", url, payload: { kind: "point", ...point } } as const;
  expect((await api.inject(request)).statusCode).toBe(200);
  const response = await api.inject(request);
  expect(response.statusCode).toBe(429);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(resolve).toHaveBeenCalledTimes(1);
});

test("[CUS-02:http] publishes the bilingual wilaya directory without an account", async () => {
  const records = [
    { code: 16, nameAr: "الجزائر", nameFr: "Alger" },
    { code: 69, nameAr: "الأبيض سيدي الشيخ", nameFr: "El Abiodh Sidi Cheikh" },
  ];
  const resolveActor = vi.fn();
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor,
    wilayas: () => Promise.resolve(records),
  });
  onTestFinished(() => api.close());
  const directory = await api.inject("/v1/wilayas");
  expect(directory.statusCode).toBe(200);
  expect(directory.headers["cache-control"]).toBe("public, max-age=300, s-maxage=3600");
  expect(directory.json()).toEqual({ wilayas: records });
  expect(resolveActor).not.toHaveBeenCalled();
});
