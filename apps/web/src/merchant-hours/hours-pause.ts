import type { HoursWrite } from "./hours-http";

type PauseFailure = Exclude<HoursWrite, { kind: "saved" }>["kind"];
export interface PauseCommand {
  readonly idempotencyKey: string;
  readonly input: { readonly pausedUntil: string | null; readonly expectedRevision: number };
}

export type PauseState =
  | { readonly kind: "loading" | "unavailable" }
  | {
      readonly kind: "ready";
      readonly pausedUntil: string | null;
      readonly notice?: "saved";
      readonly failure?: PauseFailure;
      /** Present only after an uncertain failure: the exact command to resend. */
      readonly retry?: PauseCommand;
    }
  | {
      readonly kind: "saving";
      readonly pausedUntil: string | null;
      readonly command: PauseCommand;
    };

export type PauseEvent =
  | { readonly kind: "loaded"; readonly pausedUntil: string | null }
  | { readonly kind: "load-failed" }
  | { readonly kind: "save-started"; readonly command: PauseCommand }
  | { readonly kind: "save-finished"; readonly result: HoursWrite };

export const initialPauseState: PauseState = { kind: "loading" };

const minuteMs = 60_000;

export function pauseInstant(nowMs: number, minutes: number): string {
  return new Date(nowMs + minutes * minuteMs).toISOString();
}

/** Mirrors the M1 `isOpenAt` rule: the override ends exactly at the stored instant. */
export function isPausedAt(pausedUntil: string | null, nowMs: number): boolean {
  return pausedUntil !== null && Date.parse(pausedUntil) > nowMs;
}

function finishPause(state: PauseState, result: HoursWrite): PauseState {
  if (state.kind !== "saving") return state;
  const { command, pausedUntil } = state;
  if (result.kind === "saved") {
    return { kind: "ready", pausedUntil: command.input.pausedUntil, notice: "saved" };
  }
  const shouldReuseKey = "shouldReuseKey" in result && result.shouldReuseKey;
  return {
    kind: "ready",
    pausedUntil,
    failure: result.kind,
    ...(shouldReuseKey && { retry: command }),
  };
}

export function reducePause(state: PauseState, event: PauseEvent): PauseState {
  switch (event.kind) {
    case "loaded":
      return { kind: "ready", pausedUntil: event.pausedUntil };
    case "load-failed":
      return { kind: "unavailable" };
    case "save-started":
      return state.kind === "ready"
        ? { kind: "saving", pausedUntil: state.pausedUntil, command: event.command }
        : state;
    case "save-finished":
      return finishPause(state, event.result);
  }
}

/** Resends the held command for the same target, so a retry cannot apply a different body. */
export function preparePause(
  state: PauseState,
  target: { pausedUntil: string | null; revision: number },
  createKey: () => string,
): PauseCommand | undefined {
  if (state.kind !== "ready") return undefined;
  if (state.retry && state.retry.input.pausedUntil === target.pausedUntil) return state.retry;
  const input = { pausedUntil: target.pausedUntil, expectedRevision: target.revision };
  return { idempotencyKey: createKey(), input };
}
