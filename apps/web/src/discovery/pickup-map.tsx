"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import { Marker, type Map } from "maplibre-gl";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useLowData } from "./low-data";
import { getFeedMessages } from "./feed-messages";
import { pinsBounds, pinsCentre, type PickupPin } from "./pickup-pins";
import "../maps/algeria-map.css";

const MapCanvas = dynamic(() => import("../maps/map-canvas").then((module) => module.MapCanvas), {
  ssr: false,
});

const pinStaggerMs = 70;
const pinPadding = { top: 56, bottom: 24, left: 72, right: 72 };

function pinElement(pin: PickupPin, index: number, locale: Locale): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "pickup-pin";
  link.href = `/${locale}/restaurants/${encodeURIComponent(pin.slug)}`;
  link.dataset.open = String(pin.isOpen);
  const label = document.createElement("bdi");
  label.textContent = pin.name;
  link.append(label);
  // CSP blocks style attributes; CSSOM is allowed. Each pin rises a beat after the last.
  link.style.animationDelay = `${String(index * pinStaggerMs)}ms`;
  return link;
}

function usePins(map: Map | null, pins: readonly PickupPin[], locale: Locale) {
  useEffect(() => {
    if (map === null) return;
    const bounds = pinsBounds(pins);
    // Leave room above each pin for its name label, which sits on top of the point.
    if (bounds) map.fitBounds(bounds, { padding: pinPadding, maxZoom: 15, duration: 0 });
    const markers = pins.map((pin, index) =>
      new Marker({ element: pinElement(pin, index, locale), anchor: "bottom" })
        .setLngLat([pin.longitude, pin.latitude])
        .addTo(map),
    );
    return () => {
      for (const marker of markers) marker.remove();
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
