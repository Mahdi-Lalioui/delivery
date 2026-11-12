"use client";

import { useEffect, useRef } from "react";
import type { Tracking } from "./tracking-http";
import { layoutMap, splitRoute } from "./tracking-map";

type Delivery = Extract<Tracking, { fulfilment: "delivery" }>;
const box = { width: 400, height: 400, padding: 96 };
const viewBox = [0, 0, box.width, box.height].join(" ");
/** Soft city blocks under the route (decorative). */
const blocks: readonly (readonly [number, number, number, number])[] = [
  [20, 20, 120, 90],
  [160, 30, 110, 70],
  [290, 20, 100, 110],
  [30, 140, 90, 120],
  [140, 120, 130, 80],
  [290, 150, 90, 90],
  [20, 290, 140, 90],
  [180, 230, 90, 140],
  [290, 270, 100, 110],
];

function translate(point: { x: number; y: number }): string {
  return "translate(" + point.x.toFixed(1) + " " + point.y.toFixed(1) + ")";
}

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
  const {
    destination,
    courier: courierPoint,
    route,
  } = layoutMap(
    { destination: tracking.destination, courier: position, route: tracking.route ?? [] },
    box,
  );
  const courier = position === null ? undefined : courierPoint;
  const [travelled, remaining] = splitRoute(route, courier);
  const routePoints = toPoints(route);
  const start = (tracking.route?.length ?? 0) > 1 ? route[0] : undefined;
  return (
    <figure className="tracking-map" aria-label={label}>
      <svg viewBox={viewBox} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <pattern id="tracking-zellige" width="40" height="40" patternUnits="userSpaceOnUse">
            <path className="tracking-map-tile" d="M20 4 36 20 20 36 4 20Z" />
          </pattern>
        </defs>
        <rect className="tracking-map-ground" width={box.width} height={box.height} />
        <rect width={box.width} height={box.height} fill="url(#tracking-zellige)" opacity="0.35" />
        {blocks.map(([x, y, w, h]) => (
          <rect
            key={`${String(x)}-${String(y)}`}
            className="tracking-map-block"
            x={x}
            y={y}
            width={w}
            height={h}
            rx="10"
          />
        ))}
        <path className="tracking-map-street" d="M-10 290 C 120 250, 220 330, 410 260" />
        <path className="tracking-map-street" d="M90 -10 C 120 160, 60 260, 140 410" />
        <path className="tracking-map-street" d="M300 -10 C 280 150, 340 270, 290 410" />
        {routePoints !== "" && <polyline className="tracking-map-road" points={routePoints} />}
        <RouteLines travelled={toPoints(travelled)} remaining={toPoints(remaining)} />
        <Markers
          start={start}
          destination={destination}
          courier={courier}
          heading={position?.heading}
        />
      </svg>
    </figure>
  );
}

type Point = { x: number; y: number };

function Markers({
  start,
  destination,
  courier,
  heading,
}: {
  start: Point | undefined;
  destination: Point | undefined;
  courier: Point | undefined;
  heading: number | undefined;
}) {
  return (
    <>
      {start && (
        <g className="tracking-map-start" transform={translate(start)}>
          <circle r="13" />
          <path d="M-6 -1.5 -4.5 -6h9L6 -1.5M-5 -1.5v6.5h10v-6.5M-1.5 5v-3.5h3V5" />
        </g>
      )}
      {destination && (
        <g className="tracking-map-destination" transform={translate(destination)}>
          <circle r="24" className="tracking-map-halo" />
          <path
            className="tracking-map-pin"
            d="M0 6C-9 -3 -12 -8 -12 -14a12 12 0 0 1 24 0c0 6-3 11-12 20z"
          />
          <path className="tracking-map-home" d="M-5 -13 0 -18l5 5v6h-10z" />
        </g>
      )}
      {courier && <CourierMarker x={courier.x} y={courier.y} heading={heading ?? 0} />}
    </>
  );
}

function RouteLines({ travelled, remaining }: { travelled: string; remaining: string }) {
  return (
    <>
      {travelled !== "" && <polyline className="tracking-map-route-done" points={travelled} />}
      {remaining !== "" && (
        <polyline className="tracking-map-route" points={remaining} pathLength={1} />
      )}
    </>
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
