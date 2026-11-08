"use client";

import { useEffect } from "react";

// DESIGN §8.2 fallback: "order confirmed — the tagine" as SVG + CSS. The lid lifts on a bouncy
// spring and saffron steam rises (~1.3 s), then the caller moves on to tracking. The 3D version can
// replace this later; this one is also the reduced-motion and low-end path.

const sceneMs = 1300;
const reducedMs = 120;
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
      <ellipse className="tagine-plate" cx={100} cy={150} rx={80} ry={16} />
      <path className="tagine-base" d="M40 140 Q100 170 160 140 L150 128 Q100 146 50 128 Z" />
      <g className="tagine-lid">
        <path className="tagine-lid-body" d="M50 128 Q100 30 150 128 Z" />
        <circle className="tagine-lid-knob" cx={100} cy={58} r={8} />
      </g>
    </svg>
  );
}
