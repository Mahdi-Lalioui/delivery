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
        "line-color": getComputedStyle(map.getContainer()).getPropertyValue("--color-mint"),
        "line-width": 22,
        "line-blur": 8,
        "line-opacity": 0.85,
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
const streetPitch = 55;

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
  const hasPlaced = useRef(false);

  // The map paints flat first: a tilted camera loads the far tiles too, which drops frames on
  // mid-range phones while the page is still loading. It tilts once that first wave has settled.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    addGlow(map);
    map.once("idle", () => {
      map.easeTo({ pitch: streetPitch, duration: isReducedMotion() ? 0 : 600 });
    });
  }, [isReady, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady || !courier) return;
    const pose = poseOf(courier, heading.current);
    heading.current = pose.heading;
    // The first position is a jump (the map is still settling); later moves glide.
    const duration = isReducedMotion() || !hasPlaced.current ? 0 : 850;
    hasPlaced.current = true;
    map.easeTo({ center: [pose.longitude, pose.latitude], duration });
    if (!isReducedMotion()) placeScooter(map, pose);
  }, [courier, isReady, mapRef]);
}
