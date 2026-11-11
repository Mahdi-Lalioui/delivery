import { afterEach, expect, test, vi } from "vitest";
import {
  canConfirmLocation,
  filterCommunes,
  readBrowserLocation,
  readSavedLocation,
  resolveLocation,
  saveLocation,
} from "../src/discovery/location";

const commune = {
  id: "019d6abc-1234-7234-8234-123456789abc",
  code: "1601",
  wilayaCode: 16,
  nameAr: "الجزائر الوسطى",
  nameFr: "Aïn Bénian",
};
const point = { kind: "point", latitude: 36.7666581, longitude: 3.0574036 } as const;
const outcome = {
  latitude: point.latitude,
  longitude: point.longitude,
  communeId: commune.id,
  serviceAreaId: null,
};

afterEach(() => vi.unstubAllGlobals());

test("[CUS-02] commune search handles accents and Arabic spelling across both names", () => {
  const other = { ...commune, code: "1602", nameFr: "Bab El Oued", nameAr: "باب الوادي" };
  for (const query of ["ain ben", "الْجَزَائِر الوسطى", "١٦٠١"]) {
    expect(filterCommunes([other, commune], query)).toEqual([commune]);
  }
});

test("[GEO-02] requests a fresh fix and requires refinement above 40 metres", async () => {
  const { latitude, longitude } = point;
  const coords = {
    latitude,
    longitude,
    accuracy: 41,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  };
  const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>((receive) => {
    const position = { coords: { ...coords, toJSON: () => coords }, timestamp: 123 };
    receive({ ...position, toJSON: () => position });
  });

  const fix = await readBrowserLocation({ getCurrentPosition });
  expect(fix).toEqual({ input: point, accuracy: 41 });
  expect(canConfirmLocation(fix)).toBe(false);
  expect(canConfirmLocation({ input: point, accuracy: 40 })).toBe(true);
  expect(canConfirmLocation({ input: point, accuracy: null })).toBe(true);
  expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
    enableHighAccuracy: true,
    timeout: 15_000,
    maximumAge: 0,
  });
});

test("[CUS-02] a failed geolocation request leaves commune selection available", async () => {
  await expect(readBrowserLocation(undefined)).resolves.toBeNull();
  expect(
    canConfirmLocation({
      input: { kind: "commune", communeId: commune.id },
      accuracy: null,
    }),
  ).toBe(true);
});

test("[GEO-02] point coverage sends precise coordinates in the POST body only", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json(outcome));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;

  await expect(resolveLocation(point, signal)).resolves.toEqual(outcome);
  expect(fetch).toHaveBeenCalledWith("/v1/geo/serviceability", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(point),
    signal,
  });
});

test("[CUS-02] coverage failures cannot become persisted selections", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ ...outcome, latitude: "36.7" }));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;

  await expect(resolveLocation(point, signal)).resolves.toBeNull();
  await expect(resolveLocation(point, signal)).resolves.toBeNull();
});

test("[CUS-02] restores a confirmed location across visits and ignores malformed storage", () => {
  let persisted: string | null = null;
  const storage = {
    getItem: () => persisted,
    setItem: (_key: string, value: string) => {
      persisted = value;
    },
  };
  const saved = { location: outcome, commune: { nameAr: commune.nameAr, nameFr: commune.nameFr } };

  expect(readSavedLocation(storage)).toBeNull();
  saveLocation(storage, saved);
  expect(readSavedLocation(storage)).toEqual(saved);

  persisted = JSON.stringify({ location: { ...outcome, longitude: 181 }, commune: saved.commune });
  expect(readSavedLocation(storage)).toBeNull();
  persisted = "{";
  expect(readSavedLocation(storage)).toBeNull();
});

test("[CUS-02] a blocked storage provider leaves location selection usable for the visit", () => {
  const storage = {
    getItem: () => {
      throw new Error("Storage blocked");
    },
    setItem: () => {
      throw new Error("Storage blocked");
    },
  };

  expect(readSavedLocation(storage)).toBeNull();
  expect(() => {
    saveLocation(storage, { location: outcome, commune: null });
  }).not.toThrow();
});
