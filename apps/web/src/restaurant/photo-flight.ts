import { useEffect } from "react";

type Box = { left: number; top: number; width: number; height: number };
type Origin = { box: Box; at: number };

const photoSelector = ".restaurant-dish-photo";
const freshMs = 1000;
let origin: Origin | undefined;

/** A CSS time token ("400ms", ".4s") in milliseconds; NaN when it is not a time. */
export function cssDurationMs(value: string): number {
  const match = /^(-?[\d.]+)(ms|s)$/u.exec(value.trim());
  if (!match) return Number.NaN;
  const amount = Number(match[1]);
  return match[2] === "s" ? amount * 1000 : amount;
}

/** The transform that makes `to` sit exactly over `from`, for a FLIP animation. */
export function flightTransform(from: Box, to: Box): string {
  const scaleX = from.width / to.width;
  const scaleY = from.height / to.height;
  const x = from.left - to.left;
  const y = from.top - to.top;
  return `translate(${String(x)}px, ${String(y)}px) scale(${String(scaleX)}, ${String(scaleY)})`;
}

function remember(event: Event) {
  if (!(event.target instanceof Element)) return;
  const card = event.target.closest(".restaurant-dish, .restaurant-popular-card");
  const photo = card?.querySelector(photoSelector);
  origin = photo ? { box: photo.getBoundingClientRect(), at: performance.now() } : undefined;
}

/** Remembers which dish photo the diner tapped, so the sheet's photo can grow out of it. */
export function useDishOrigin() {
  useEffect(() => {
    document.addEventListener("click", remember, { capture: true });
    return () => {
      document.removeEventListener("click", remember, { capture: true });
    };
  }, []);
}

function freshOrigin(): Origin | undefined {
  const start = origin;
  origin = undefined;
  if (!start || performance.now() - start.at > freshMs) return undefined;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? undefined : start;
}

/** The photo carries the motion: settle the sheet's own slide so the landing spot is final. */
function settleSheet(dialog: HTMLElement) {
  dialog.getBoundingClientRect(); // flush styles so the sheet's CSS animation exists
  for (const animation of dialog.getAnimations({ subtree: true })) {
    const end = animation.effect?.getComputedTiming().endTime;
    if (typeof end === "number" && Number.isFinite(end)) animation.finish();
  }
}

function tokenTiming(tokens: CSSStyleDeclaration, duration: string, easing: string) {
  return {
    duration: cssDurationMs(tokens.getPropertyValue(duration)),
    easing: tokens.getPropertyValue(easing).trim(),
  };
}

/** Grows the open sheet's photo out of the tapped card photo; a no-op without a fresh origin. */
export function flyPhoto(dialog: HTMLElement) {
  const start = freshOrigin();
  const photo = dialog.querySelector<HTMLElement>(photoSelector);
  if (!start || !photo) return;
  settleSheet(dialog);
  const end = photo.getBoundingClientRect();
  const tokens = getComputedStyle(photo);
  const timing = tokenTiming(tokens, "--motion-slow", "--ease-spring-gentle");
  if (end.width === 0 || !Number.isFinite(timing.duration) || timing.easing === "") return;
  const radius = tokens.getPropertyValue("--radius-lg").trim();
  const fade = tokenTiming(tokens, "--motion-base", "--ease-decelerate");
  if (Number.isFinite(fade.duration) && fade.easing !== "")
    dialog.animate([{ opacity: 0 }, { opacity: 1 }], fade);
  const flight = { from: start.box, radius, timing };
  carryFlight(dialog, photo.animate(flightFrames(flight, end), timing), flight);
}

type Flight = { from: Box; radius: string; timing: KeyframeAnimationOptions };

function flightFrames({ from, radius }: Flight, to: Box): Keyframe[] {
  return [
    { transform: flightTransform(from, to), transformOrigin: "0 0", borderRadius: radius },
    { transform: "none", transformOrigin: "0 0", borderRadius: "0" },
  ];
}

/**
 * The sheet swaps its loading photo for the form's photo when the dish details arrive; the
 * running flight continues on the new photo from the same moment instead of being cut off.
 */
function carryFlight(dialog: HTMLElement, running: Animation, flight: Flight) {
  let current = running;
  const observer = new MutationObserver(() => {
    const photo = dialog.querySelector<HTMLElement>(photoSelector);
    if (!photo || photo.getAnimations().length > 0 || current.playState === "finished") return;
    const next = photo.animate(flightFrames(flight, photo.getBoundingClientRect()), flight.timing);
    next.currentTime = current.currentTime;
    current = next;
  });
  observer.observe(dialog, { childList: true, subtree: true });
  window.setTimeout(() => {
    observer.disconnect();
  }, Number(flight.timing.duration));
}
