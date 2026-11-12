import type { Map } from "maplibre-gl";
import { useEffect, useRef, type RefObject } from "react";
import type { ScooterPose } from "./scooter-layer";

type Scooter = { setPose: (pose: ScooterPose) => void };
type Courier = { latitude: number; longitude: number; heading?: number | null | undefined } | null;

const routeSource = "awid-delivery-route";
const glowLayer = "awid-route-glow";

function isReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A soft, wide, blurred copy of the route under the solid line: the glowing ribbon. */
function addGlow(map: Map) {
  if (map.getLayer(glowLayer) || !map.getSource(routeSource)) return;
  map.addLayer(
    {
      id: glowLayer,
      type: "line",
      source: routeSource,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": getComputedStyle(map.getContainer()).getPropertyValue("--color-primary"),
        "line-width": 18,
        "line-blur": 12,
        "line-opacity": 0.45,
      },
    },
    routeSource,
  );
}

function poseOf(courier: NonNullable<Courier>, fallbackHeading: number): ScooterPose {
  return {
    longitude: courier.longitude,
    latitude: courier.latitude,
    heading: courier.heading ?? fallbackHeading,
  };
}

/** One scooter per map instance, so a remounted map gets its own and a late pose wins. */
const scooters = new WeakMap<Map, { layer?: Scooter; pose: ScooterPose }>();

function placeScooter(map: Map, pose: ScooterPose) {
  const known = scooters.get(map);
  if (known) {
    known.pose = pose;
    known.layer?.setPose(pose);
    return;
  }
  const entry: { layer?: Scooter; pose: ScooterPose } = { pose };
  scooters.set(map, entry);
  void import("./scooter-layer")
    .then(({ scooterLayer }) => {
      if (map.getLayer("awid-scooter")) return;
      const layer = scooterLayer(entry.pose);
      map.addLayer(layer);
      entry.layer = layer;
      map.getContainer().dataset.scooter = "true";
    })
    .catch(() => {
      scooters.delete(map);
    });
}

/** Tilts the live map to street level, adds the glowing route and a 3D scooter that it follows. */
export function useTrackingScene(
  mapRef: RefObject<Map | null>,
  isReady: boolean,
  courier: Courier,
) {
  const heading = useRef(0);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    addGlow(map);
    map.easeTo({ pitch: 55, duration: isReducedMotion() ? 0 : 1200 });
  }, [isReady, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady || !courier) return;
    const pose = poseOf(courier, heading.current);
    heading.current = pose.heading;
    map.easeTo({
      center: [pose.longitude, pose.latitude],
      duration: isReducedMotion() ? 0 : 850,
    });
    if (!isReducedMotion()) placeScooter(map, pose);
  }, [courier, isReady, mapRef]);
}
