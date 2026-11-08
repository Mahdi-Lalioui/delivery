"use client";

import { useEffect, useReducer, useRef, useState, type Dispatch } from "react";
import type { HoursEvent, HoursState } from "./hours-flow";
import { readHoursPause, setHoursPause } from "./hours-http";
import {
  initialPauseState,
  isPausedAt,
  pauseInstant,
  pauseFocusSelector,
  preparePause,
  reducePause,
  type PauseState,
} from "./hours-pause";

// Browsers clamp longer timers; re-check at least daily.
const maxTimerMs = 86_400_000;

/** Re-reads the clock when the stored override ends, so "Closed until" disappears on time. */
function useClosedNow(state: PauseState): [boolean, () => void] {
  const [checkedAt, setCheckedAt] = useState(0);
  const pausedUntil = state.kind === "ready" || state.kind === "saving" ? state.pausedUntil : null;
  useEffect(() => {
    setCheckedAt(Date.now());
    if (pausedUntil === null) return;
    const delay = Math.min(Math.max(Date.parse(pausedUntil) - Date.now(), 0), maxTimerMs);
    const timer = setTimeout(() => {
      setCheckedAt(Date.now());
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [pausedUntil]);
  const refresh = () => {
    setCheckedAt(Date.now());
  };
  return [checkedAt > 0 && isPausedAt(pausedUntil, checkedAt), refresh];
}

export function useHoursPause({
  merchantId,
  version,
  hours,
  dispatchHours,
  isBlocked,
  onSettled,
}: {
  merchantId: string;
  version: number;
  hours: HoursState;
  dispatchHours: Dispatch<HoursEvent>;
  /** True while another command on the shared D-011 revision is in flight. */
  isBlocked: () => boolean;
  /** Receives the selector to focus once the fieldset is enabled again. */
  onSettled: (selector: string | undefined) => void;
}) {
  const [state, dispatch] = useReducer(reducePause, initialPauseState);
  const inFlight = useRef(false);
  const [isPaused, refreshClock] = useClosedNow(state);

  useEffect(() => {
    const controller = new AbortController();
    void readHoursPause({ merchantId, signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      dispatch(
        result.kind === "ready"
          ? { kind: "loaded", pausedUntil: result.data.pausedUntil }
          : { kind: "load-failed" },
      );
    });
    return () => {
      controller.abort();
    };
  }, [merchantId, version]);

  async function send(pausedUntil: string | null) {
    if (inFlight.current || isBlocked() || hours.kind !== "editing") return;
    const target = { pausedUntil, revision: hours.revision };
    const command = preparePause(state, target, () => crypto.randomUUID());
    if (!command || state.kind !== "ready") return;
    const saving = { kind: "saving", pausedUntil: state.pausedUntil, command } as const;
    inFlight.current = true;
    dispatch({ kind: "save-started", command });
    const { sessionId } = hours;
    const result = await setHoursPause({ merchantId, sessionId, ...command });
    inFlight.current = false;
    const event = { kind: "save-finished", result } as const;
    // Same batch as the new state, so the first render already shows the right action.
    refreshClock();
    dispatch(event);
    onSettled(pauseFocusSelector(reducePause(saving, event)));
    if (result.kind === "saved") {
      dispatchHours({ kind: "revision-advanced", revision: result.data.revision });
    }
  }

  function retry() {
    if (state.kind === "ready" && state.retry) void send(state.retry.input.pausedUntil);
  }

  return {
    state,
    isPaused,
    close: (minutes: number) => {
      void send(pauseInstant(Date.now(), minutes));
    },
    reopen: () => {
      void send(null);
    },
    retry,
  };
}
