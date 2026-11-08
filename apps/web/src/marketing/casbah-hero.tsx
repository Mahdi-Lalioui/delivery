"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import type { CasbahHero3dProps as Hero3dProps } from "./casbah-hero-3d";
import { canRunHero3d, heroDevicePixelRatio } from "./casbah-scene";

function readCapabilities() {
  const memory: unknown = Reflect.get(navigator, "deviceMemory");
  const connection: unknown = Reflect.get(navigator, "connection");
  const isSaveData =
    typeof connection === "object" &&
    connection !== null &&
    Reflect.get(connection, "saveData") === true;
  return {
    hasWebgl2: document.createElement("canvas").getContext("webgl2") !== null,
    deviceMemoryGb: typeof memory === "number" ? memory : undefined,
    cores: navigator.hardwareConcurrency,
    isSaveData,
    isReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
}

/** Runs after the browser is idle (post-LCP), with a timeout fallback for Safari. */
function whenIdle(callback: () => void): () => void {
  if ("requestIdleCallback" in window) {
    const handle = window.requestIdleCallback(callback, { timeout: 4000 });
    return () => {
      window.cancelIdleCallback(handle);
    };
  }
  const timer = setTimeout(callback, 1500);
  return () => {
    clearTimeout(timer);
  };
}

function useLazyHero(): ComponentType<Hero3dProps> | undefined {
  const [Hero, setHero] = useState<ComponentType<Hero3dProps>>();
  useEffect(() => {
    let isActive = true;
    const cancel = whenIdle(() => {
      if (!canRunHero3d(readCapabilities())) return;
      void import("./casbah-hero-3d").then((module) => {
        if (isActive) setHero(() => module.default);
      });
    });
    return () => {
      isActive = false;
      cancel();
    };
  }, []);
  return Hero;
}

function useHeroSignals(frame: React.RefObject<HTMLDivElement | null>) {
  const [scroll, setScroll] = useState(0);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(true);
  useEffect(() => {
    const element = frame.current;
    if (element === null) return;
    let isOnScreen = true;
    const update = () => {
      setIsVisible(isOnScreen && !document.hidden);
    };
    const observer = new IntersectionObserver(([entry]) => {
      isOnScreen = entry?.isIntersecting ?? true;
      update();
    });
    observer.observe(element);
    const onScroll = () => {
      setScroll(Math.min(1, window.scrollY / Math.max(1, element.offsetHeight)));
    };
    const onPointer = (event: PointerEvent) => {
      const box = element.getBoundingClientRect();
      setPointer({
        x: ((event.clientX - box.left) / box.width) * 2 - 1,
        y: ((event.clientY - box.top) / box.height) * 2 - 1,
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    element.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      element.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [frame]);
  return { scroll, pointer, isVisible };
}

/** DESIGN §8.1: poster first (LCP), live scene layered on top only on capable devices. */
export function CasbahHero(props: { seed: number; poster: ReactNode; homeTargetId: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const Hero = useLazyHero();
  const { scroll, pointer, isVisible } = useHeroSignals(frame);
  const isMobile = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  return (
    <div ref={frame} className="casbah-frame" data-hero={Hero === undefined ? "poster" : "live"}>
      {props.poster}
      {Hero !== undefined && (
        <Hero
          seed={props.seed}
          scroll={scroll}
          pointer={pointer}
          dpr={heroDevicePixelRatio({ devicePixelRatio: window.devicePixelRatio, isMobile })}
          hasShadows={!isMobile}
          isRunning={isVisible}
          onHomeSelect={() => {
            document.getElementById(props.homeTargetId)?.focus();
          }}
        />
      )}
    </div>
  );
}
