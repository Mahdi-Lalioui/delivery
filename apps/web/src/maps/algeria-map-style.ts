import { layers } from "@protomaps/basemaps";
import type { Locale } from "@zaafran/i18n/locales";
import palettes from "@zaafran/tokens/palettes.json" with { type: "json" };
import type { StyleSpecification, SymbolLayerSpecification } from "maplibre-gl";
import { awidFlavor } from "./awid-map-flavor";

export interface MapPoint {
  latitude: number;
  longitude: number;
}

/**
 * Protomaps falls back to English and stacks a second local-script line. We want one name, in
 * the page language when OpenStreetMap has it, else the local name: never English.
 */
function localName(layer: SymbolLayerSpecification, locale: Locale): SymbolLayerSpecification {
  const field = layer.layout?.["text-field"];
  if (field === undefined || !JSON.stringify(field).includes("name")) return layer;
  return {
    ...layer,
    layout: {
      ...layer.layout,
      "text-field": ["coalesce", ["get", `name:${locale}`], ["get", "name"]],
    },
  };
}

/** Overlays (routes, accuracy rings) go just under this layer so street names stay on top. */
export const labelAnchorId = "awid-labels";

export function algeriaMapStyle(locale: Locale, dark: boolean): StyleSpecification {
  const palette = dark ? palettes.dark : palettes.light;
  // Labels follow the page language: French names on French screens, Arabic on Arabic.
  const base = layers("algeria", awidFlavor(dark), { lang: locale });
  const shapes = base.filter((layer) => layer.type !== "symbol");
  const names = base.flatMap((layer) =>
    layer.type === "symbol" ? [localName(layer, locale)] : [],
  );
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
      ...shapes,
      {
        id: "awid-buildings",
        type: "fill-extrusion",
        source: "algeria",
        "source-layer": "buildings",
        minzoom: 14,
        paint: {
          // Strong border tone, softened: blocks read as volume on both themes without glare.
          "fill-extrusion-color": palette["border-strong"],
          "fill-extrusion-height": ["coalesce", ["get", "height"], 9],
          "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
          "fill-extrusion-opacity": 0.32,
          "fill-extrusion-vertical-gradient": true,
        },
      },
      { id: labelAnchorId, type: "background", layout: { visibility: "none" } },
      ...names,
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
