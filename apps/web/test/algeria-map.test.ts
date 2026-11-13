import { describe, expect, it } from "vitest";
import palettes from "@zaafran/tokens/palettes.json" with { type: "json" };
import {
  algeriaMapStyle,
  accuracyRing,
  buildingsLayerId,
  labelAnchorId,
  revealBuildingsWhenIdle,
} from "../src/maps/algeria-map-style";
import { mapTileDestination } from "../src/preview-settings";

describe("Algeria maps", () => {
  it("keeps network requests on the application origin and localizes labels", () => {
    const style = algeriaMapStyle("ar", false);
    expect(style.sources.algeria).toMatchObject({
      tiles: ["/tiles/algeria/{z}/{x}/{y}"],
      maxzoom: 15,
    });
    expect(style.glyphs).toBe("/map-assets/fonts/{fontstack}/{range}.pbf");
    const dark = algeriaMapStyle("fr", true);
    expect(dark.layers[0]).not.toEqual(style.layers[0]);
    expect(dark.layers).toContainEqual(
      expect.objectContaining({ type: "fill-extrusion", minzoom: 14 }),
    );
  });

  it("[CUS-18] names streets in the page language, never English, in fonts we ship", () => {
    for (const locale of ["fr", "ar"] as const) {
      const labels = algeriaMapStyle(locale, false).layers.filter(
        (layer) => layer.type === "symbol",
      );
      const text = JSON.stringify(labels);
      expect(text).toContain(`name:${locale}`);
      expect(text).not.toContain("name:en");
      expect(text).not.toMatch(/Noto Sans (Medium|Italic|Bold)/);
    }
  });

  it("keeps every label above the buildings and overlays", () => {
    const layers = algeriaMapStyle("fr", true).layers;
    const anchor = layers.findIndex((layer) => layer.id === labelAnchorId);
    const firstLabel = layers.findIndex((layer) => layer.type === "symbol");
    const buildings = layers.findIndex((layer) => layer.type === "fill-extrusion");
    expect(buildings).toBeLessThan(anchor);
    expect(anchor).toBeLessThan(firstLabel);
    expect(layers.slice(anchor + 1).every((layer) => layer.type === "symbol")).toBe(true);
  });

  it("[CUS-18] starts 3D buildings hidden so the first tile wave paints flat and smooth", () => {
    const buildings = algeriaMapStyle("fr", false).layers.find(
      (layer) => layer.id === buildingsLayerId,
    );
    expect(buildings).toMatchObject({ type: "fill-extrusion", layout: { visibility: "none" } });
  });

  it("[CUS-18] raises the buildings once the map first goes idle, and only once", () => {
    const calls: unknown[][] = [];
    let idle: (() => void) | undefined;
    const map = {
      once: (event: "idle", listener: () => void) => {
        expect(event).toBe("idle");
        idle = listener;
      },
      getLayer: (id: string) => (id === buildingsLayerId ? {} : undefined),
      setLayoutProperty: (...args: unknown[]) => calls.push(args),
    };
    revealBuildingsWhenIdle(map);
    expect(calls).toEqual([]);
    idle?.();
    expect(calls).toEqual([[buildingsLayerId, "visibility", "visible"]]);
  });

  it("does nothing when the map was torn down before it went idle", () => {
    let idle: (() => void) | undefined;
    const calls: unknown[][] = [];
    revealBuildingsWhenIdle({
      once: (_event: "idle", listener: () => void) => {
        idle = listener;
      },
      getLayer: () => undefined,
      setLayoutProperty: (...args: unknown[]) => calls.push(args),
    });
    idle?.();
    expect(calls).toEqual([]);
  });

  it("paints the basemap from AWID tokens, not the stock grey", () => {
    const style = algeriaMapStyle("fr", false);
    const text = JSON.stringify(style.layers);
    expect(text).toContain(palettes.light["surface-2"]);
    expect(text).toContain(palettes.light["info-bg"]);
    expect(text).not.toMatch(/"pois"/);
  });

  it("renders a closed accuracy boundary in longitude/latitude order", () => {
    const [ring] = accuracyRing({ latitude: 36.77, longitude: 3.05 }, 80).coordinates;
    expect(ring).toHaveLength(33);
    expect(ring?.at(0)).toEqual(ring?.at(-1));
    expect(ring?.at(0)?.[0]).toBeCloseTo(3.05, 6);
    expect(ring?.at(0)?.[1]).toBeGreaterThan(36.77);
  });

  it("proxies public HTTPS deployments and local Martin without accepting other origins", () => {
    expect(mapTileDestination({ ZAAFRAN_API_ORIGIN: "https://api.example.test" })).toBe(
      "https://api.example.test/tiles/:path*",
    );
    expect(mapTileDestination({ ZAAFRAN_TILE_ORIGIN: "http://127.0.0.1:5501" })).toBe(
      "http://127.0.0.1:5501/:path*",
    );
    for (const origin of [
      "http://example.test",
      "http://127.0.0.1:5501/path",
      "https://user@example.test",
    ]) {
      expect(() => mapTileDestination({ ZAAFRAN_TILE_ORIGIN: origin })).toThrow();
    }
  });
});
