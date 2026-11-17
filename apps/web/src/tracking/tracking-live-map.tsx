"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Map } from "maplibre-gl";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { checkBasemap } from "./basemap-check";
import { useLowData } from "../discovery/low-data";
import type { Tracking } from "./tracking-http";
import { useTrackingScene } from "./use-tracking-scene";

const MapCanvas = dynamic(() => import("../maps/map-canvas").then(({ MapCanvas }) => MapCanvas), {
  ssr: false,
});

type Delivery = Extract<Tracking, { fulfilment: "delivery" }>;

export function TrackingLiveMap({
  tracking,
  locale,
  fallback,
}: {
  tracking: Delivery;
  locale: Locale;
  fallback: ReactNode;
}) {
  const trackingCopy = useTranslations("tracking");
  const map = useRef<Map>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const stopCheck = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      stopCheck.current?.();
    },
    [],
  );
  // "Loaded" is not enough: the designed map stays up until real streets are drawn.
  function onMapState(next: "loading" | "ready" | "error") {
    stopCheck.current?.();
    stopCheck.current = null;
    const current = map.current;
    if (next !== "ready" || current === null) {
      setState(next);
      return;
    }
    stopCheck.current = checkBasemap(current, (isDrawn) => {
      setState(isDrawn ? "ready" : "empty");
    });
  }
  const [requested, setRequested] = useState(false);
  const lowData = useLowData();
  const { courier, route } = tracking;
  const { latitude, longitude } = tracking.destination;
  const destination = useMemo(() => ({ latitude, longitude }), [latitude, longitude]);
  const position = courier ? courier.position : null;
  const [isStreetView, setStreetView] = useState(false);
  useTrackingScene(map, { isReady: state === "ready", courier: position, isStreetView });
  const canShow = requested || !lowData;
  const canRender = canShow && state !== "error" && state !== "empty";
  return (
    <div className="tracking-basemap">
      <div className="tracking-map tracking-map-real" role="group" aria-label={trackingCopy("map")}>
        {canRender && (
          <MapCanvas
            locale={locale}
            initial={destination}
            selected={destination}
            accuracy={undefined}
            choose={false}
            label={trackingCopy("map")}
            mapRef={map}
            onState={onMapState}
            delivery={{ route, courier: position }}
          />
        )}
        {state !== "ready" && fallback}
      </div>
      <MapControls
        locale={locale}
        state={canShow ? controlState(state) : "closed"}
        isStreetView={isStreetView}
        onStreetView={() => {
          setStreetView((current) => !current);
        }}
        onOpen={() => {
          setState("loading");
          setRequested(true);
        }}
      />
    </div>
  );
}

function controlState(state: "loading" | "ready" | "empty" | "error") {
  return state === "empty" ? "error" : state;
}

function MapControls({
  locale,
  state,
  onOpen,
  isStreetView,
  onStreetView,
}: {
  locale: Locale;
  state: "loading" | "ready" | "error" | "closed";
  onOpen: () => void;
  isStreetView: boolean;
  onStreetView: () => void;
}) {
  const copy = getMessages(locale).maps;
  if (state === "loading") return null;
  if (state === "ready") {
    return (
      <div className="tracking-map-attribution">
        <button
          className="awid-map-action"
          type="button"
          aria-pressed={isStreetView}
          onClick={onStreetView}
        >
          {copy.streetView}
        </button>
        <a href="https://www.openstreetmap.org/copyright" lang="en" dir="ltr">
          {copy.attribution}
        </a>
      </div>
    );
  }
  // The designed map stays visible; this card says why and offers the one useful action.
  return (
    <div className="tracking-map-notice" role="status">
      <p>{state === "error" ? copy.streetsMissing : copy.dataSaver}</p>
      <button className="awid-map-action" type="button" onClick={onOpen}>
        {state === "error" ? copy.retry : copy.show}
      </button>
    </div>
  );
}
