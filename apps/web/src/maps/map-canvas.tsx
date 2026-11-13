"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { Map, Marker, setWorkerUrl } from "maplibre-gl";
import { useEffect, useEffectEvent, useRef, type RefObject } from "react";
import { accuracyRing, algeriaMapStyle, labelAnchorId, type MapPoint } from "./algeria-map-style";
import { useDeliveryOverlay, type DeliveryOverlay } from "./delivery-overlay";
import "maplibre-gl/dist/maplibre-gl.css";

setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());

type MapState = "loading" | "ready" | "error";

interface MapCanvasProps {
  locale: Locale;
  initial: MapPoint;
  selected: MapPoint | undefined;
  accuracy: number | undefined;
  choose: boolean;
  delivery?: DeliveryOverlay;
  label: string;
  mapRef: RefObject<Map | null>;
  onState: (state: MapState) => void;
}

const loadTimeoutMs = 12_000;

function camera(point: MapPoint): [number, number] {
  return [point.longitude, point.latitude];
}

function applyAccuracy(map: Map, point: MapPoint | undefined, meters: number | undefined) {
  if (map.getLayer("awid-accuracy")) map.removeLayer("awid-accuracy");
  if (map.getSource("awid-accuracy")) map.removeSource("awid-accuracy");
  if (!point || !meters) return;

  map.addSource("awid-accuracy", { type: "geojson", data: accuracyRing(point, meters) });
  map.addLayer(
    {
      id: "awid-accuracy",
      type: "fill",
      source: "awid-accuracy",
      paint: {
        "fill-color": getComputedStyle(map.getContainer()).getPropertyValue("--color-info"),
        "fill-opacity": 0.2,
      },
    },
    labelAnchorId,
  );
}

function useMap({
  locale,
  initial,
  selected,
  accuracy,
  choose,
  label,
  mapRef,
  onState,
}: MapCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const marker = useRef<Marker | null>(null);
  const latest = useEffectEvent(() => ({ initial, selected, accuracy, onState }));

  useEffect(() => {
    if (!container.current) return;
    const settings = latest();
    let map: Map;
    try {
      const dark = getComputedStyle(container.current).colorScheme === "dark";
      map = new Map({
        container: container.current,
        style: algeriaMapStyle(locale, dark),
        center: camera(settings.selected ?? settings.initial),
        zoom: settings.selected ? 16 : 13,
        maxBounds: [
          [-8.69, 18.95],
          [12.01, 37.15],
        ],
        maxZoom: 19,
        dragRotate: false,
        renderWorldCopies: false,
        scrollZoom: false,
        pitch: choose ? 0 : 55,
        attributionControl: false,
      });
    } catch {
      settings.onState("error");
      return;
    }

    const canvas = map.getCanvas();
    canvas.setAttribute("aria-label", label);
    mapRef.current = map;
    // Hidden tabs pause rendering, so only give up on a map the diner can actually see.
    const giveUp = () => {
      if (document.hidden) timeout = window.setTimeout(giveUp, loadTimeoutMs);
      else latest().onState("error");
    };
    let timeout = window.setTimeout(giveUp, loadTimeoutMs);
    map.on("error", () => {
      latest().onState("error");
    });
    map.once("load", () => {
      window.clearTimeout(timeout);
      const active = latest();
      applyAccuracy(map, active.selected, active.accuracy);
      active.onState("ready");
    });
    if (!choose) {
      const pin = document.createElement("div");
      pin.className = "awid-map-marker";
      pin.setAttribute("aria-hidden", "true");
      marker.current = new Marker({ element: pin, anchor: "bottom" })
        .setLngLat(camera(settings.selected ?? settings.initial))
        .addTo(map);
    }
    return () => {
      window.clearTimeout(timeout);
      marker.current?.remove();
      mapRef.current = null;
      map.remove();
    };
  }, [choose, label, locale, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const point = selected ?? initial;
    map.jumpTo({ center: camera(point), zoom: selected ? Math.max(map.getZoom(), 16) : 13 });
    marker.current?.setLngLat(camera(point));
    if (map.isStyleLoaded()) applyAccuracy(map, selected, accuracy);
  }, [accuracy, initial, mapRef, selected]);

  return container;
}

export function MapCanvas(props: MapCanvasProps) {
  const container = useMap(props);
  useDeliveryOverlay({
    mapRef: props.mapRef,
    overlay: props.delivery,
    destination: props.initial,
    generation: props.locale + props.label,
  });
  return <div ref={container} className="awid-map-canvas" />;
}
