"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Button } from "@zaafran/ui";
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

type SceneModule = ComponentType<Hero3dProps> | "unavailable";
type ManualLabels = {
  open: string;
  close: string;
  loading: string;
  unavailable: string;
  instruction: string;
};

function useLazyHero(enabled: boolean, immediate: boolean): SceneModule | undefined {
  const [Hero, setHero] = useState<SceneModule>();
  useEffect(() => {
    if (!enabled || Hero !== undefined) return;
    let isActive = true;
    const load = () => {
      if (!canRunHero3d(readCapabilities())) {
        setHero("unavailable");
        return;
      }
      void import("./casbah-hero-3d").then(
        (module) => {
          if (isActive) setHero(() => module.default);
        },
        () => {
          if (isActive) setHero("unavailable");
        },
      );
    };
    const cancel = immediate ? undefined : whenIdle(load);
    if (immediate) load();
    return () => {
      isActive = false;
      cancel?.();
    };
  }, [enabled, immediate, Hero]);
  return Hero;
}

function useHeroSignals(frame: React.RefObject<HTMLDivElement | null>, localScroll: boolean) {
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
      const distance = localScroll
        ? Math.max(0, -element.getBoundingClientRect().top)
        : window.scrollY;
      setScroll(Math.min(1, distance / Math.max(1, element.offsetHeight)));
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
  }, [frame, localScroll]);
  return { scroll, pointer, isVisible };
}

/** DESIGN §8.1: poster first (LCP), live scene layered on top only on capable devices. */
export function CasbahHero(props: {
  seed: number;
  poster: ReactNode;
  homeTargetId: string;
  manual?: ManualLabels;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [requested, setRequested] = useState(false);
  const isManual = props.manual !== undefined;
  const enabled = !isManual || requested;
  const Hero = useLazyHero(enabled, isManual);
  const signals = useHeroSignals(frame, isManual);
  const live = enabled && typeof Hero === "function";
  return (
    <>
      <div ref={frame} className="casbah-frame" data-hero={live ? "live" : "poster"}>
        {props.poster}
        {live && (
          <LiveScene
            Hero={Hero}
            seed={props.seed}
            signals={signals}
            homeTargetId={props.homeTargetId}
            diorama={isManual}
          />
        )}
      </div>
      {props.manual && (
        <SceneControls
          labels={props.manual}
          requested={requested}
          scene={Hero}
          onToggle={() => {
            setRequested((current) => !current);
          }}
        />
      )}
    </>
  );
}

function LiveScene({
  Hero,
  seed,
  signals,
  homeTargetId,
  diorama,
}: {
  Hero: ComponentType<Hero3dProps>;
  seed: number;
  signals: ReturnType<typeof useHeroSignals>;
  homeTargetId: string;
  diorama: boolean;
}) {
  const isMobile = window.matchMedia("(pointer: coarse)").matches;
  return (
    <Hero
      seed={seed}
      scroll={signals.scroll}
      pointer={signals.pointer}
      dpr={heroDevicePixelRatio({ devicePixelRatio: window.devicePixelRatio, isMobile })}
      hasShadows={!isMobile && !diorama}
      isRunning={signals.isVisible}
      diorama={diorama}
      onHomeSelect={() => {
        document.getElementById(homeTargetId)?.focus();
      }}
    />
  );
}

function SceneControls({
  labels,
  requested,
  scene,
  onToggle,
}: {
  labels: ManualLabels;
  requested: boolean;
  scene: SceneModule | undefined;
  onToggle: () => void;
}) {
  const message = sceneMessage(labels, requested, scene);
  return (
    <div className="casbah-controls">
      <Button variant="primary" onClick={onToggle} aria-pressed={requested}>
        {requested ? labels.close : labels.open}
      </Button>
      <p role="status">{message}</p>
    </div>
  );
}

function sceneMessage(labels: ManualLabels, requested: boolean, scene: SceneModule | undefined) {
  if (!requested) return "";
  if (scene === undefined) return labels.loading;
  return scene === "unavailable" ? labels.unavailable : labels.instruction;
}
