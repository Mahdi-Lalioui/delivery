import { DARK, LIGHT, layers } from "@protomaps/basemaps";
import type { Locale } from "@zaafran/i18n/locales";
import palettes from "@zaafran/tokens/palettes.json" with { type: "json" };
import type { StyleSpecification } from "maplibre-gl";

export interface MapPoint {
  latitude: number;
  longitude: number;
}

export function algeriaMapStyle(locale: Locale, dark: boolean): StyleSpecification {
  const palette = dark ? palettes.dark : palettes.light;
  const flavor = {
    ...(dark ? DARK : LIGHT),
    background: palette["info-bg"],
    water: palette["info-bg"],
    earth: palette.bg,
    park_a: palette["success-bg"],
    park_b: palette["success-bg"],
    buildings: palette["surface-3"],
    major: palette.surface,
    minor_a: palette.surface,
    boundaries: palette["border-strong"],
  };
  return {
    version: 8,
    glyphs: "/map-assets/fonts/{fontstack}/{range}.pbf",
    sources: {
      algeria: {
        type: "vector",
        tiles: ["/tiles/algeria/{z}/{x}/{y}"],
        minzoom: 0,
        maxzoom: 15,
      },
    },
    layers: [
      ...layers("algeria", flavor),
      {
        id: "awid-buildings",
        type: "fill-extrusion",
        source: "algeria",
        "source-layer": "buildings",
        minzoom: 15,
        paint: {
          "fill-extrusion-color": palette["surface-3"],
          "fill-extrusion-height": ["coalesce", ["get", "height"], 5],
          "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
        },
      },
      {
        id: "awid-places",
        type: "symbol",
        source: "algeria",
        "source-layer": "places",
        layout: {
          "text-field": ["coalesce", ["get", `name:${locale}`], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 4, 11, 14, 15],
        },
        paint: {
          "text-color": palette.text,
          "text-halo-color": palette.bg,
          "text-halo-width": 1.5,
        },
      },
    ],
  };
}

export function accuracyRing({ latitude, longitude }: MapPoint, meters: number) {
  const points = 32;
  const latRadius = meters / 111_195;
  const lngRadius = latRadius / Math.cos((latitude * Math.PI) / 180);
  const ring = Array.from({ length: points }, (_, step) => {
    const angle = (step / points) * 2 * Math.PI;
    return [longitude + Math.sin(angle) * lngRadius, latitude + Math.cos(angle) * latRadius];
  });
  return { type: "Polygon" as const, coordinates: [[...ring, [longitude, latitude + latRadius]]] };
}
