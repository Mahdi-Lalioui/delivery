"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import { Marker, type Map } from "maplibre-gl";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useLowData } from "./low-data";
import { getFeedMessages } from "./feed-messages";
import { clusterBubble, pinCard } from "./pickup-pin-element";
import { groupPins, pinsBounds, pinsCentre, type PickupPin } from "./pickup-pins";
import "../maps/algeria-map.css";

const MapCanvas = dynamic(() => import("../maps/map-canvas").then((module) => module.MapCanvas), {
  ssr: false,
});

const pinStaggerMs = 70;
const pinPadding = { top: 72, bottom: 24, left: 96, right: 96 };
/** A card's footprint: pins whose cards would overlap merge into one count. */
const cardSizePx = { width: 168, height: 60 };

type Placed = { key: string; marker: Marker };

function zoomTo(map: Map, members: readonly PickupPin[]) {
  const bounds = pinsBounds(members);
  if (bounds) map.fitBounds(bounds, { padding: pinPadding, maxZoom: 17 });
}

function markerFor(map: Map, members: readonly PickupPin[], locale: Locale): Marker {
  const [first] = members;
  const element =
    members.length === 1 && first
      ? pinCard(first, locale)
      : clusterBubble(members.length, locale, () => {
          zoomTo(map, members);
        });
  const centre = pinsCentre(members) ?? { latitude: 0, longitude: 0 };
  return new Marker({ element, anchor: "bottom" }).setLngLat([centre.longitude, centre.latitude]);
}

/** Re-groups pins for the current zoom, keeping markers whose group did not change. */
function syncMarkers(
  map: Map,
  { pins, locale }: { pins: readonly PickupPin[]; locale: Locale },
  placed: Placed[],
) {
  const points = pins.map((pin) => map.project([pin.longitude, pin.latitude]));
  const groups = groupPins(points, cardSizePx).map((indexes) =>
    indexes.flatMap((index) => pins[index] ?? []),
  );
  const keys = groups.map((members) => members.map(({ slug }) => slug).join("|"));
  const kept = placed.filter(({ key }) => keys.includes(key));
  for (const { key, marker } of placed) if (!keys.includes(key)) marker.remove();
  const fresh = groups.flatMap((members, index) => {
    const key = keys[index] ?? "";
    if (kept.some((item) => item.key === key)) return [];
    const marker = markerFor(map, members, locale).addTo(map);
    // CSP blocks style attributes; CSSOM is allowed. New cards rise a beat after each other.
    marker.getElement().style.animationDelay = `${String(index * pinStaggerMs)}ms`;
    return [{ key, marker }];
  });
  return [...kept, ...fresh];
}

function usePins(map: Map | null, pins: readonly PickupPin[], locale: Locale) {
  useEffect(() => {
    if (map === null) return;
    const bounds = pinsBounds(pins);
    if (bounds) map.fitBounds(bounds, { padding: pinPadding, maxZoom: 15, duration: 0 });
    let placed: Placed[] = [];
    const sync = () => {
      placed = syncMarkers(map, { pins, locale }, placed);
    };
    sync();
    map.on("moveend", sync);
    return () => {
      map.off("moveend", sync);
      for (const { marker } of placed) marker.remove();
    };
  }, [map, pins, locale]);
}

/**
 * Pickup mode's map: every restaurant you can collect from rises onto the map as a named pin
 * that opens its menu. Low-data mode and map failures leave the list below to do the job.
 */
export function PickupMap({ locale, pins }: { locale: Locale; pins: readonly PickupPin[] }) {
  const messages = getFeedMessages(locale);
  const mapRef = useRef<Map>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const isLowData = useLowData();
  const centre = pinsCentre(pins);
  usePins(state === "ready" ? mapRef.current : null, pins, locale);
  if (centre === null || isLowData || state === "error") return null;
  return (
    <section className="pickup-map" aria-label={messages.pickupMap} aria-busy={state === "loading"}>
      <MapCanvas
        locale={locale}
        initial={centre}
        selected={undefined}
        accuracy={undefined}
        choose
        label={messages.pickupMap}
        mapRef={mapRef}
        onState={setState}
      />
      {state === "loading" && (
        <p className="awid-map-loading" role="status">
          {getMessages(locale).maps.loading}
        </p>
      )}
    </section>
  );
}
