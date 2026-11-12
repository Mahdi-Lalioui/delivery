import { DARK, LIGHT, type Flavor } from "@protomaps/basemaps";
import palettes from "@zaafran/tokens/palettes.json" with { type: "json" };

type Palette = (typeof palettes)["light"];

/** The only glyph stack we ship; it carries Latin and Arabic ranges. */
const mapFont = "Noto Sans Regular";

function ground(palette: Palette) {
  const land = palette["surface-2"];
  const green = palette["success-bg"];
  const soft = palette["surface-3"];
  return {
    background: land,
    earth: land,
    water: palette["info-bg"],
    park_a: green,
    park_b: palette["mint-pale"],
    wood_a: green,
    wood_b: green,
    scrub_a: green,
    scrub_b: green,
    zoo: green,
    hospital: soft,
    industrial: soft,
    school: soft,
    pedestrian: palette.surface,
    military: soft,
    aerodrome: soft,
    runway: palette["border-subtle"],
    glacier: palette.surface,
    sand: palette.cream,
    beach: palette.cream,
    pier: palette.surface,
    buildings: soft,
    boundaries: palette["border-strong"],
    railway: palette["border-strong"],
  };
}

function roads(palette: Palette) {
  const street = palette.surface;
  const big = palette.cream;
  const casing = palette["border-subtle"];
  const kinds = { other: street, minor: street, link: street, major: street, highway: big };
  const layers: Record<string, string> = {
    other: street,
    minor_service: street,
    minor_a: street,
    minor_b: street,
    link: street,
    major: street,
    highway: big,
    minor_service_casing: casing,
    minor_casing: casing,
    link_casing: casing,
    major_casing_early: casing,
    major_casing_late: casing,
    highway_casing_early: casing,
    highway_casing_late: casing,
  };
  for (const [kind, colour] of Object.entries(kinds)) {
    for (const level of ["tunnel", "bridges"]) {
      layers[`${level}_${kind}`] = colour;
      layers[`${level}_${kind}_casing`] = casing;
    }
  }
  return layers;
}

function labels(palette: Palette) {
  const halo = palette.bg;
  return {
    roads_label_minor: palette["text-3"],
    roads_label_minor_halo: halo,
    roads_label_major: palette["text-2"],
    roads_label_major_halo: halo,
    ocean_label: palette.info,
    subplace_label: palette["text-2"],
    subplace_label_halo: halo,
    city_label: palette.text,
    city_label_halo: halo,
    state_label: palette["text-3"],
    state_label_halo: halo,
    country_label: palette["text-3"],
    address_label: palette["text-3"],
    address_label_halo: halo,
  };
}

/**
 * The basemap painted in AWID tokens: mint-tinted land, soft blue water, white streets with
 * cream main roads, and labels in our text colours. No POI icons: our pins are the only places.
 */
export function awidFlavor(dark: boolean): Flavor {
  const palette = dark ? palettes.dark : palettes.light;
  const flavor: Flavor = {
    ...(dark ? DARK : LIGHT),
    ...ground(palette),
    ...roads(palette),
    ...labels(palette),
    regular: mapFont,
    bold: mapFont,
    italic: mapFont,
  };
  // Drop the POI and landcover sets: they need sprites we don't ship and add noise.
  delete flavor.pois;
  delete flavor.landcover;
  return flavor;
}
