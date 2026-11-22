import { Map } from "maplibre-gl";
import type * as React from "react";
import { afterEach, expect, test, vi } from "vitest";
import { useTrackingScene } from "../src/tracking/use-tracking-scene";

const { addLayer, easeTo } = vi.hoisted(() => ({ addLayer: vi.fn(), easeTo: vi.fn() }));

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
    addLayer = addLayer;
    easeTo = easeTo;
    getSource = () => undefined;
    getLayer = () => undefined;
  },
}));

vi.mock("../src/tracking/scooter-layer", () => ({
  scooterLayer: () => ({}),
}));

afterEach(async () => {
  await vi.dynamicImportSettled();
  vi.unstubAllGlobals();
  addLayer.mockClear();
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

test("[CUS-18] reduced motion keeps the fallback rider and tilts without animation", async () => {
  vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
  const map = new Map({ container: "tracking" });
  useTrackingScene(
    { current: map },
    { isReady: true, isStreetView: true, courier: { latitude: 36.77, longitude: 3.06 } },
  );
  await vi.dynamicImportSettled();
  expect(addLayer).not.toHaveBeenCalled();
  expect(easeTo).toHaveBeenCalledWith({ pitch: 55, duration: 0 });
});
