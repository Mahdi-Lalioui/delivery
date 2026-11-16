import { useEffect, useRef, useState } from "react";

type PhotoState = "settled" | "loading";

/** A photo that already loaded before hydration stays visible; only a pending one fades in. */
export function photoStateAfterMount(isComplete: boolean): PhotoState {
  return isComplete ? "settled" : "loading";
}

/** Hides a still-loading photo after hydration, then reveals it on load (DESIGN §6 fade-in). */
export function usePhotoFade() {
  const imageRef = useRef<HTMLImageElement>(null);
  // The server markup keeps the photo visible, so it still shows without JavaScript.
  const [state, setState] = useState<PhotoState>("settled");

  useEffect(() => {
    const image = imageRef.current;
    if (image) setState(photoStateAfterMount(image.complete));
  }, []);

  const settle = () => {
    setState("settled");
  };
  return { imageRef, state, onLoad: settle, onError: settle };
}
