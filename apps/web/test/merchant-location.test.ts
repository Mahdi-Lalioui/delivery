import { expect, test, vi } from "vitest";
import { readBrowserPin } from "../src/merchant/merchant-location";

test("[MER-01] explicitly requests a fresh high-accuracy position and preserves the decimal pin", async () => {
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

  await expect(readBrowserPin({ getCurrentPosition })).resolves.toEqual({
    kind: "found",
    latitude: "36.7666581",
    longitude: "3.0574036",
    approximate: true,
  });
  expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
    enableHighAccuracy: true,
    timeout: 15_000,
    maximumAge: 0,
  });
});

test("[MER-01] an unavailable location API leaves the manual coordinate path usable", async () => {
  await expect(readBrowserPin(undefined)).resolves.toEqual({ kind: "unavailable" });
});
