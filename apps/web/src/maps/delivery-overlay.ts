import { LngLatBounds, Marker, type GeoJSONSource, type Map } from "maplibre-gl";
import { useEffect, useRef, type RefObject } from "react";
import { labelAnchorId, type MapPoint } from "./algeria-map-style";

export type DeliveryOverlay = {
  route: readonly MapPoint[] | null;
  courier: (MapPoint & { heading?: number | undefined }) | null;
};

const sourceId = "awid-delivery-route";

function coordinates({ latitude, longitude }: MapPoint): [number, number] {
  return [longitude, latitude];
}

function drawRoute(map: Map, route: DeliveryOverlay["route"]) {
  const data = {
    type: "FeatureCollection",
    features:
      route && route.length > 1
        ? [
            {
              type: "Feature",
              geometry: { type: "LineString", coordinates: route.map(coordinates) },
              properties: {},
            },
          ]
        : [],
  } as const;
  const source = map.getSource<GeoJSONSource>(sourceId);
  if (source) {
    void source.setData(data).catch(() => undefined);
    return;
  }
  map.addSource(sourceId, { type: "geojson", data });
  const palette = getComputedStyle(map.getContainer());
  map.addLayer(
    {
      id: sourceId,
      type: "line",
      source: sourceId,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": palette.getPropertyValue("--color-primary"), "line-width": 5 },
    },
    labelAnchorId,
  );
}

function courierMarker(map: Map, point: NonNullable<DeliveryOverlay["courier"]>) {
  const element = document.createElement("div");
  element.className = "tracking-map-rider";
  element.setAttribute("aria-hidden", "true");
  return new Marker({ element, rotationAlignment: "map" })
    .setLngLat(coordinates(point))
    .setRotation(point.heading ?? 0)
    .addTo(map);
}

function moveCourier(marker: Marker, point: NonNullable<DeliveryOverlay["courier"]>) {
  const from = marker.getLngLat();
  const start = performance.now();
  const heading = marker.getRotation();
  const turn = (((point.heading ?? heading) - heading + 540) % 360) - 180;
  let frame: number;
  function animate(time: number) {
    const t = Math.min(1, (time - start) / 850);
    const ease = 1 - (1 - t) ** 3;
    marker
      .setLngLat([
        from.lng + (point.longitude - from.lng) * ease,
        from.lat + (point.latitude - from.lat) * ease,
      ])
      .setRotation(heading + turn * ease);
    if (t < 1) frame = window.requestAnimationFrame(animate);
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    marker.setLngLat(coordinates(point)).setRotation(heading + turn);
    return undefined;
  }
  frame = window.requestAnimationFrame(animate);
  return () => {
    window.cancelAnimationFrame(frame);
  };
}

export function useDeliveryOverlay({
  mapRef,
  overlay,
  destination,
  generation,
}: {
  mapRef: RefObject<Map | null>;
  overlay: DeliveryOverlay | undefined;
  destination: MapPoint;
  generation: string;
}) {
  const rider = useRef<Marker | undefined>(undefined);
  const { courier, route } = overlay ?? {};
  const enabled = overlay !== undefined;
  useEffect(
    () => () => {
      rider.current?.remove();
      rider.current = undefined;
    },
    [generation],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !enabled) return;
    const draw = () => {
      drawRoute(map, route ?? null);
    };
    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
    return () => {
      map.off("load", draw);
    };
  }, [enabled, generation, mapRef, route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !enabled) return;
    if (!courier) {
      rider.current?.remove();
      rider.current = undefined;
      return;
    }
    if (rider.current) return moveCourier(rider.current, courier);
    rider.current = courierMarker(map, courier);
    const bounds = new LngLatBounds(coordinates(destination), coordinates(destination));
    bounds.extend(coordinates(courier));
    map.fitBounds(bounds, { padding: 68, maxZoom: 16, duration: 0 });
  }, [courier, destination, enabled, generation, mapRef]);
}
