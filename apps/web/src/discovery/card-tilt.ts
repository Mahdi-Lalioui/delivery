"use client";

import type { PointerEvent } from "react";

// The brief's card tilt: a few degrees of 3D rotation that follows a fine pointer (mouse or
// trackpad). Touch and reduced motion get nothing. Uses CSSOM, which the CSP allows.

const maxDegrees = 5;

function canTilt(): boolean {
  return (
    window.matchMedia("(pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Rotation for a pointer at (x, y) inside a box, as a CSS transform. */
export function tiltTransform(
  point: { x: number; y: number },
  box: { width: number; height: number },
): string {
  const rotateY = ((point.x / box.width) * 2 - 1) * maxDegrees;
  const rotateX = (1 - (point.y / box.height) * 2) * maxDegrees;
  return `perspective(700px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
}

export const tiltHandlers = {
  onPointerMove(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse" || !canTilt()) return;
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    element.style.transform = tiltTransform(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      rect,
    );
  },
  onPointerLeave(event: PointerEvent<HTMLElement>) {
    event.currentTarget.style.transform = "";
  },
};
