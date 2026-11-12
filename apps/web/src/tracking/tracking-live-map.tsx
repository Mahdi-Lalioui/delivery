"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Map } from "maplibre-gl";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState, type ReactNode } from "react";
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
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [requested, setRequested] = useState(false);
  const lowData = useLowData();
  const { courier, route } = tracking;
  const { latitude, longitude } = tracking.destination;
  const destination = useMemo(() => ({ latitude, longitude }), [latitude, longitude]);
  const position = courier ? courier.position : null;
  useTrackingScene(map, state === "ready", position);
  const canShow = requested || !lowData;
  const canRender = canShow && state !== "error";
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
            onState={setState}
            delivery={{ route, courier: position }}
          />
        )}
        {(!canRender || state === "loading") && fallback}
      </div>
      <MapControls
        locale={locale}
        state={canShow ? state : "closed"}
        onOpen={() => {
          setState("loading");
          setRequested(true);
        }}
      />
    </div>
  );
}

function MapControls({
  locale,
  state,
  onOpen,
}: {
  locale: Locale;
  state: "loading" | "ready" | "error" | "closed";
  onOpen: () => void;
}) {
  const copy = getMessages(locale).maps;
  if (state === "loading") return null;
  return (
    <div className="tracking-map-attribution">
      {state === "ready" ? (
        <a href="https://www.openstreetmap.org/copyright" lang="en" dir="ltr">
          {copy.attribution}
        </a>
      ) : (
        <button className="awid-map-action" type="button" onClick={onOpen}>
          {state === "error" ? copy.retry : copy.show}
        </button>
      )}
    </div>
  );
}
