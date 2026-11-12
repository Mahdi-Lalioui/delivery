"use client";

import { dzd } from "@zaafran/domain/money";
import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { useEffect, useRef, useState } from "react";

const countMs = 420;

/** The amount shown at `progress` (0–1) of a count from `from` to `to`, in whole dinars. */
export function countedDzd(from: number, to: number, progress: number): number {
  const ease = 1 - (1 - Math.min(1, Math.max(0, progress))) ** 3;
  return Math.round(from + (to - from) * ease);
}

function format(value: number, locale: Locale): string {
  const result = dzd(value);
  return result.ok ? formatDzd(result.value, locale) : "";
}

/**
 * A price that counts to its new value instead of jumping. Screen readers get only the final
 * amount; the moving digits are hidden from them. Reduced motion shows the final value at once.
 */
export function CountingDzd({ value, locale }: { value: number; locale: Locale }) {
  const [shown, setShown] = useState<number>(value);
  const from = useRef<number>(value);

  useEffect(() => {
    const start = from.current;
    if (start === value || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = value;
      setShown(value);
      return;
    }
    const startedAt = performance.now();
    let frame = 0;
    const step = (time: number) => {
      const next = countedDzd(start, value, (time - startedAt) / countMs);
      from.current = next;
      setShown(next);
      if (next !== value) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    // Frames pause in background tabs; always land on the exact amount on time.
    const land = window.setTimeout(() => {
      window.cancelAnimationFrame(frame);
      from.current = value;
      setShown(value);
    }, countMs + 40);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(land);
    };
  }, [value]);

  return (
    <>
      <span className="ui-visually-hidden">{format(value, locale)}</span>
      <span className="counting-dzd" aria-hidden="true">
        {format(shown, locale)}
      </span>
    </>
  );
}
