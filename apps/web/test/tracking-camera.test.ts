import { Map } from "maplibre-gl";
import type * as React from "react";
import { afterEach, expect, test, vi } from "vitest";
import { useTrackingScene } from "../src/tracking/use-tracking-scene";

const { easeTo } = vi.hoisted(() => ({ easeTo: vi.fn() }));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useEffect: (effect: () => void) => {
    effect();
  },
  useEffectEvent: (callback: unknown) => callback,
  useRef: (current: unknown) => ({ current }),
}));

vi.mock("maplibre-gl", () => ({
  Map: class {
    easeTo = easeTo;
    getSource = () => undefined;
    getLayer = () => ({});
  },
}));

vi.mock("../src/tracking/scooter-layer", () => ({
  scooterLayer: () => ({}),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  easeTo.mockClear();
});

test.each([
  { isStreetView: true, pitch: 55 },
  { isStreetView: false, pitch: 0 },
])(
  "[CUS-18] a position update keeps the requested camera pitch $pitch",
  ({ isStreetView, pitch }) => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    const map = new Map({ container: "tracking" });
    useTrackingScene(
      { current: map },
      { isReady: true, isStreetView, courier: { latitude: 36.77, longitude: 3.06 } },
    );
    expect(easeTo).toHaveBeenCalledWith(expect.objectContaining({ pitch }));
    expect(easeTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: [3.06, 36.77], pitch }),
    );
  },
);
