"use client";

import { useEffect, useRef, useState } from "react";

function ring(context: AudioContext) {
  const start = context.currentTime;
  const tone = context.createOscillator();
  const volume = context.createGain();
  tone.type = "sine";
  tone.frequency.setValueAtTime(660, start);
  tone.frequency.setValueAtTime(880, start + 0.15);
  volume.gain.setValueAtTime(0.001, start);
  volume.gain.exponentialRampToValueAtTime(0.12, start + 0.04);
  volume.gain.exponentialRampToValueAtTime(0.001, start + 0.37);
  tone.connect(volume).connect(context.destination);
  tone.start(start);
  tone.stop(start + 0.38);
}

export function useOrderSound(pending: boolean) {
  const context = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  async function toggle() {
    if (enabled) {
      setEnabled(false);
      return;
    }
    try {
      context.current ??= new AudioContext();
      await context.current.resume();
      setEnabled(true);
    } catch {
      setUnavailable(true);
    }
  }

  useEffect(() => {
    const audio = context.current;
    if (!audio || !enabled || !pending) return;
    ring(audio);
    const interval = setInterval(() => {
      ring(audio);
    }, 8_000);
    return () => {
      clearInterval(interval);
    };
  }, [enabled, pending]);

  useEffect(
    () => () => {
      void context.current?.close().catch(() => undefined);
      context.current = null;
    },
    [],
  );

  return { enabled, toggle, unavailable };
}
