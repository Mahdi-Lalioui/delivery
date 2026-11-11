"use client";

import { useEffect, useRef } from "react";
import type { Tracking } from "./tracking-http";
import { layoutMap } from "./tracking-map";

type Delivery = Extract<Tracking, { fulfilment: "delivery" }>;
const box = { width: 400, height: 400, padding: 96 };
const viewBox = [0, 0, box.width, box.height].join(" ");

function toPoints(points: readonly { x: number; y: number }[]): string {
  return points.map((point) => point.x.toFixed(1) + "," + point.y.toFixed(1)).join(" ");
}

/**
 * The live delivery map in AWID colours: route drawn in, destination pin, and a scooter
 * marker that glides and turns with its heading. A tiled basemap replaces the background
 * once lane A publishes the AWID tile style (docs/requests/lane-b-tracking.md).
 */
export function TrackingMap({ tracking, label }: { tracking: Delivery; label: string }) {
  const position = tracking.courier?.position ?? null;
  const { destination, courier, route } = layoutMap(
    { destination: tracking.destination, courier: position, route: tracking.route ?? [] },
    box,
  );
  const routePoints = toPoints(route);
  return (
    <figure className="tracking-map" aria-label={label}>
      <svg viewBox={viewBox} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <pattern id="tracking-zellige" width="40" height="40" patternUnits="userSpaceOnUse">
            <path className="tracking-map-tile" d="M20 4 36 20 20 36 4 20Z" />
          </pattern>
        </defs>
        <rect className="tracking-map-ground" width={box.width} height={box.height} />
        <rect width={box.width} height={box.height} fill="url(#tracking-zellige)" />
        <path className="tracking-map-street" d="M-10 290 C 120 250, 220 330, 410 260" />
        <path className="tracking-map-street" d="M90 -10 C 120 160, 60 260, 140 410" />
        <path className="tracking-map-street" d="M300 -10 C 280 150, 340 270, 290 410" />
        {routePoints !== "" && (
          <polyline className="tracking-map-route" points={routePoints} pathLength={1} />
        )}
        {position && courier && (
          <CourierMarker x={courier.x} y={courier.y} heading={position.heading ?? 0} />
        )}
        {destination && (
          <g
            className="tracking-map-destination"
            transform={
              "translate(" + destination.x.toFixed(1) + " " + destination.y.toFixed(1) + ")"
            }
          >
            <circle r="18" className="tracking-map-halo" />
            <circle r="8" />
          </g>
        )}
      </svg>
    </figure>
  );
}

/** Scooter marker: glides to each new position (Web Animations, no inline styles) and turns. */
function CourierMarker({ x, y, heading }: { x: number; y: number; heading: number }) {
  const marker = useRef<SVGGElement>(null);
  const previous = useRef<string | null>(null);
  const transform =
    "translate(" +
    x.toFixed(1) +
    "px, " +
    y.toFixed(1) +
    "px) rotate(" +
    String(Math.round(heading)) +
    "deg)";
  useEffect(() => {
    const element = marker.current;
    if (!element) return;
    const isReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = previous.current ?? transform;
    previous.current = transform;
    element.animate([{ transform: from }, { transform }], {
      duration: isReduced ? 0 : 1200,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      fill: "forwards",
    });
  }, [transform]);
  return (
    <g ref={marker} className="tracking-map-courier">
      <circle r="20" className="tracking-map-courier-halo" />
      <circle r="14" className="tracking-map-courier-dot" />
      <path className="tracking-map-courier-arrow" d="M0 -9 L5 3 L0 0 L-5 3Z" />
    </g>
  );
}
