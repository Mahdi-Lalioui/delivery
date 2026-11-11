"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import { Icon } from "@zaafran/ui";
import type { Map } from "maplibre-gl";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import type { MapPoint } from "./algeria-map-style";
import "./algeria-map.css";

const MapCanvas = dynamic(() => import("./map-canvas").then((module) => module.MapCanvas), {
  ssr: false,
});

const algeriaCenter: MapPoint = { latitude: 36.7538, longitude: 3.0588 };

export function AlgeriaMap({
  locale,
  initial = algeriaCenter,
  selected,
  accuracy,
  onSelect,
}: {
  locale: Locale;
  initial?: MapPoint;
  selected?: MapPoint | undefined;
  accuracy?: number | undefined;
  onSelect?: (point: MapPoint) => void;
}) {
  const t = getMessages(locale).maps;
  const mapRef = useRef<Map>(null);
  const [state, setState] = useState<"closed" | "loading" | "ready" | "error">("closed");

  if (state === "closed")
    return (
      <button
        className="awid-map-action"
        type="button"
        onClick={() => {
          setState("loading");
        }}
      >
        <Icon name="flag" />
        {t.show}
      </button>
    );

  if (state === "error")
    return (
      <div className="awid-map-fallback">
        <p role="status">{t.unavailable}</p>
        <button
          className="awid-map-action"
          type="button"
          onClick={() => {
            setState("loading");
          }}
        >
          {t.retry}
        </button>
      </div>
    );

  return (
    <div className="awid-map">
      <div className="awid-map-frame" aria-busy={state === "loading"}>
        <MapCanvas
          {...{ locale, initial, selected, accuracy, mapRef }}
          choose={!!onSelect}
          label={t.label}
          onState={setState}
        />
        {state === "loading" && (
          <p className="awid-map-loading" role="status">
            {t.loading}
          </p>
        )}
        {state === "ready" && onSelect && (
          <span className="awid-map-crosshair" aria-hidden="true" />
        )}
        {state === "ready" && (
          <div className="awid-map-zoom">
            <button
              type="button"
              aria-label={t.zoomIn}
              onClick={() => mapRef.current?.zoomIn({ duration: 0 })}
            >
              {t.plus}
            </button>
            <button
              type="button"
              aria-label={t.zoomOut}
              onClick={() => mapRef.current?.zoomOut({ duration: 0 })}
            >
              {t.minus}
            </button>
          </div>
        )}
      </div>
      <div className="awid-map-footer">
        <a href="https://www.openstreetmap.org/copyright" lang="en" dir="ltr">
          {t.attribution}
        </a>
        {onSelect && (
          <button
            className="awid-map-action"
            type="button"
            disabled={state !== "ready"}
            onClick={() => {
              const center = mapRef.current?.getCenter();
              if (center) onSelect({ latitude: center.lat, longitude: center.lng });
            }}
          >
            {t.choose}
          </button>
        )}
      </div>
    </div>
  );
}
