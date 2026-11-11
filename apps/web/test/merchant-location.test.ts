import { expect, test, vi } from "vitest";
import { readBrowserLocation } from "../src/discovery/location";

test("[MER-01:web] explicitly requests a fresh high-accuracy position and preserves the decimal pin", async () => {
  const coords = {
    latitude: 36.7666581,
    longitude: 3.0574036,
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

  await expect(readBrowserLocation({ getCurrentPosition })).resolves.toEqual({
    input: { kind: "point", latitude: 36.7666581, longitude: 3.0574036 },
    accuracy: 41,
  });
  expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
    enableHighAccuracy: true,
    timeout: 15_000,
    maximumAge: 0,
  });
});

test("[MER-01:web] an unavailable location API leaves the map pin path usable", async () => {
  await expect(readBrowserLocation(undefined)).resolves.toBeNull();
});
