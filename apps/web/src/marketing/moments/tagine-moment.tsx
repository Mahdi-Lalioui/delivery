"use client";

import { useEffect } from "react";

// DESIGN §8.2 fallback: "order confirmed — the tagine" as SVG + CSS: a wide, low, painted cone lid
// with its knob on a shallow glazed dish. The lid lifts on a bouncy spring and steam curls rise
// (~1.3 s), then the caller moves on to tracking. It is the reduced-motion, low-data and no-WebGL
// path of the 3D tagine.

const sceneMs = 1300;
const reducedMs = 1600;

export function TagineMoment({ label, onDone }: { label: string; onDone: () => void }) {
  useEffect(() => {
    const isReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(onDone, isReduced ? reducedMs : sceneMs);
    return () => {
      clearTimeout(timer);
    };
  }, [onDone]);
  return (
    <svg className="tagine-moment" viewBox="0 0 240 200" role="img" aria-label={label}>
      <defs>
        <linearGradient id="tagine-lid-glaze" x1="0" x2="1" y1="0" y2="0">
          <stop className="tagine-glaze-light" offset="0" />
          <stop className="tagine-glaze-mid" offset="0.45" />
          <stop className="tagine-glaze-dark" offset="1" />
        </linearGradient>
      </defs>
      <g className="tagine-steam-group" aria-hidden="true">
        {steamPaths.map((path, index) => (
          <path key={path} className="tagine-steam" d={path} data-index={index} />
        ))}
      </g>
      {/* The plate's shadow, then the shallow glazed dish with its painted rim. */}
      <ellipse className="tagine-plate" cx={120} cy={172} rx={104} ry={12} />
      <path className="tagine-base" d="M22 146 C28 164 70 174 120 174 C170 174 212 164 218 146 Z" />
      <path
        className="tagine-base-band"
        d={zigzag({ fromX: 34, toX: 206, y: 156, height: 6, step: 12 })}
      />
      <ellipse className="tagine-rim" cx={120} cy={146} rx={98} ry={9} />
      <g className="tagine-lid">
        {/* A wide, low cone with slightly full sides, as a real tagine lid. */}
        <path
          className="tagine-lid-body"
          d="M44 144 C56 118 86 92 110 74 L130 74 C154 92 184 118 196 144 C160 152 80 152 44 144 Z"
        />
        <path
          className="tagine-lid-sheen"
          d="M66 132 C78 112 96 96 112 82 L118 84 C104 98 88 116 80 136 Z"
        />
        <path className="tagine-band" d="M56 132 C96 141 144 141 184 132" />
        <path
          className="tagine-band-zigzag"
          d={zigzag({ fromX: 66, toX: 174, y: 124, height: 5, step: 9 })}
        />
        <path className="tagine-band" d="M86 104 C108 109 132 109 154 104" />
        <g className="tagine-dots">
          {[96, 108, 120, 132, 144].map((x) => (
            <circle key={x} cx={x} cy={116} r={2.2} />
          ))}
        </g>
        <path className="tagine-lid-knob" d="M112 74 L128 74 L125 62 L115 62 Z" />
        <circle className="tagine-lid-knob" cx={120} cy={55} r={8} />
      </g>
    </svg>
  );
}

const steamPaths = [
  "M98 66 C90 54 106 46 98 34 C92 26 100 18 96 10",
  "M120 40 C112 30 128 22 120 12",
  "M142 66 C150 54 134 46 142 34 C148 26 140 18 144 10",
  "M108 62 C103 54 113 48 108 40",
  "M131 58 C126 50 136 44 131 36",
  "M86 72 C82 66 90 60 86 52",
] as const;

/** A painted zigzag band between two x positions, centred on a y line. */
type Zigzag = { fromX: number; toX: number; y: number; height: number; step: number };

function zigzag({ fromX, toX, y, height, step }: Zigzag) {
  const points: string[] = [];
  for (let x = fromX, isUp = true; x <= toX; x += step / 2, isUp = !isUp) {
    points.push(`${String(x)} ${String(isUp ? y - height / 2 : y + height / 2)}`);
  }
  return `M${points.join(" L")}`;
}
