"use client";

import { Icon } from "@zaafran/ui";
import { useRef, useState, type PointerEvent } from "react";

export function SlideConfirm({
  label,
  hint,
  disabled,
  rtl,
  onConfirm,
}: {
  label: string;
  hint?: string;
  disabled: boolean;
  rtl: boolean;
  onConfirm: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const pointer = useRef<{ id: number; start: number; limit: number } | undefined>(undefined);
  const direction = rtl ? -1 : 1;

  function start(event: PointerEvent<HTMLButtonElement>) {
    if (disabled || event.button !== 0 || pointer.current) return;
    pointer.current = {
      id: event.pointerId,
      start: event.clientX,
      limit: event.currentTarget.clientWidth - 64,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const drag = pointer.current;
    if (drag?.id !== event.pointerId) return;
    setOffset(Math.max(0, Math.min(drag.limit, direction * (event.clientX - drag.start))));
  }

  function reset() {
    pointer.current = undefined;
    setOffset(0);
  }

  function end(event: PointerEvent<HTMLButtonElement>) {
    const drag = pointer.current;
    if (drag?.id !== event.pointerId) return;
    reset();
    if (direction * (event.clientX - drag.start) >= drag.limit * 0.75) onConfirm();
  }

  return (
    <button
      aria-label={label}
      className="courier-slide"
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onLostPointerCapture={reset}
      onPointerCancel={reset}
      onClick={(event) => {
        if (event.detail === 0) onConfirm();
      }}
    >
      <span
        className="courier-slide-thumb"
        style={{ transform: "translateX(" + String(direction * offset) + "px)" }}
      >
        <Icon name="chevron" size={24} />
      </span>
      <span>{hint ?? label}</span>
    </button>
  );
}
