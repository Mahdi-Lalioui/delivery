"use client";

import { useEffect, useRef, useState } from "react";
import { TagineMoment } from "./tagine-moment";

function canUse3d(canvas: HTMLCanvasElement): boolean {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    return canvas.getContext("webgl2") !== null;
  } catch {
    return false;
  }
}

function tokenColours(element: HTMLElement) {
  const css = getComputedStyle(element);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    clay: token("--color-harissa"),
    glaze: token("--color-primary"),
    saffron: token("--color-food-saffron"),
    couscous: token("--color-food-couscous"),
    steam: token("--color-surface"),
  };
}

/**
 * DESIGN §8.2 "order confirmed — the tagine" in 3D: the lid springs open, steam rises, then
 * `onDone` moves on to tracking. three.js loads only here; reduced motion, missing WebGL or a
 * failed load fall back to the SVG moment, which also calls `onDone`.
 */
export function Tagine3d({ label, onDone }: { label: string; onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [isFallback, setFallback] = useState(false);
  const latestDone = useRef(onDone);
  latestDone.current = onDone;

  useEffect(() => {
    const element = canvas.current;
    if (!element || !canUse3d(element)) {
      setFallback(true);
      return;
    }
    let stop: (() => void) | undefined;
    let isCancelled = false;
    void import("./tagine-scene")
      .then(({ playTagine }) => {
        if (isCancelled) return;
        // A WebGL context was taken for the probe; the renderer reuses the same canvas.
        stop = playTagine(element, tokenColours(element), () => {
          latestDone.current();
        });
      })
      .catch(() => {
        if (!isCancelled) setFallback(true);
      });
    return () => {
      isCancelled = true;
      stop?.();
    };
  }, []);

  if (isFallback) return <TagineMoment label={label} onDone={onDone} />;
  return <canvas ref={canvas} className="tagine-3d" role="img" aria-label={label} />;
}
