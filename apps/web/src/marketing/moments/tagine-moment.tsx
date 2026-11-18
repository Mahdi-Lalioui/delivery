"use client";

import { useEffect } from "react";

// DESIGN §8.2 fallback: "order confirmed — the tagine" as SVG + CSS. The lid lifts on a bouncy
// spring and saffron steam rises (~1.3 s), then the caller moves on to tracking. The 3D version can
// replace this later; this one is also the reduced-motion and low-end path.

const sceneMs = 1300;
const reducedMs = 1600;
const steamCount = 8;

export function TagineMoment({ label, onDone }: { label: string; onDone: () => void }) {
  useEffect(() => {
    const isReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(onDone, isReduced ? reducedMs : sceneMs);
    return () => {
      clearTimeout(timer);
    };
  }, [onDone]);
  return (
    <svg className="tagine-moment" viewBox="0 0 200 200" role="img" aria-label={label}>
      <g className="tagine-steam-group" aria-hidden="true">
        {Array.from({ length: steamCount }, (_, index) => (
          <circle
            key={index}
            className="tagine-steam"
            cx={70 + index * 8}
            cy={110}
            r={4 + (index % 3)}
            data-index={index}
          />
        ))}
      </g>
      {/* A real tagine: shallow glazed dish with a rim, tall cone lid seated on it, painted bands. */}
      <ellipse className="tagine-plate" cx={100} cy={162} rx={84} ry={11} />
      <path className="tagine-base" d="M26 140 C30 156 60 165 100 165 C140 165 170 156 174 140 Z" />
      <ellipse className="tagine-rim" cx={100} cy={140} rx={74} ry={8} />
      <g className="tagine-lid">
        <path
          className="tagine-lid-body"
          d="M40 140 C74 132 90 104 95 64 L105 64 C110 104 126 132 160 140 C130 147 70 147 40 140 Z"
        />
        <path className="tagine-band" d="M57 129 C86 136 114 136 143 129" />
        <path className="tagine-band" d="M81 101 C94 105 106 105 119 101" />
        <ellipse className="tagine-lid-knob" cx={100} cy={64} rx={9} ry={3} />
        <circle className="tagine-lid-knob" cx={100} cy={56} r={7} />
      </g>
    </svg>
  );
}
