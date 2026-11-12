import type { Map } from "maplibre-gl";

/** Street-level layers an Algiers delivery map always shows when real tiles arrive. */
const streetLayers = new Set(["roads", "buildings"]);

/**
 * True when the drawn map shows streets or buildings. A style can load while its tiles fail,
 * come back empty or are only a placeholder, which would leave a bare, flat map.
 */
export function isBasemapDrawn(features: readonly { sourceLayer?: string | undefined }[]) {
  return features.some(
    ({ sourceLayer }) => sourceLayer !== undefined && streetLayers.has(sourceLayer),
  );
}

/**
 * Calls `onResult` once the map's tiles have settled, saying whether streets were drawn.
 * Slow tiles simply keep the caller waiting (and its designed fallback on screen).
 */
export function checkBasemap(map: Map, onResult: (isDrawn: boolean) => void): () => void {
  let isCancelled = false;
  const check = () => {
    if (!isCancelled) onResult(isBasemapDrawn(map.queryRenderedFeatures()));
  };
  if (map.loaded() && map.areTilesLoaded()) check();
  else map.once("idle", check);
  return () => {
    isCancelled = true;
    map.off("idle", check);
  };
}
