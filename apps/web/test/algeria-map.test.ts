import { describe, expect, it } from "vitest";
import { algeriaMapStyle, accuracyRing } from "../src/maps/algeria-map-style";
import { mapTileDestination } from "../src/preview-settings";

describe("Algeria maps", () => {
  it("keeps network requests on the application origin and localizes labels", () => {
    const style = algeriaMapStyle("ar", false);
    expect(style.sources.algeria).toMatchObject({
      tiles: ["/tiles/algeria/{z}/{x}/{y}"],
      maxzoom: 15,
    });
    expect(style.glyphs).toBe("/map-assets/fonts/{fontstack}/{range}.pbf");
    const places = style.layers.find((layer) => layer.id === "awid-places");
    expect(places).toMatchObject({
      layout: { "text-field": ["coalesce", ["get", "name:ar"], ["get", "name"]] },
    });
    const dark = algeriaMapStyle("fr", true);
    expect(dark.layers[0]).not.toEqual(style.layers[0]);
    expect(dark.layers).toContainEqual(
      expect.objectContaining({ type: "fill-extrusion", minzoom: 15 }),
    );
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
