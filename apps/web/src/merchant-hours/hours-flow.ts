import { toHoursDraft, toHoursInput, type DayError, type HoursDraft } from "./hours-editor";
import type { HoursInput, HoursWrite, StoredHours } from "./hours-http";

type Failure = Exclude<HoursWrite, { kind: "saved" }>;
type HoursFailure = Failure["kind"];
type LoadFailure = Exclude<HoursFailure, "rate-limited">;

interface Editing {
  readonly sessionId: string;
  readonly revision: number;
  readonly draft: HoursDraft;
  readonly errors: readonly DayError[];
}
interface Outcome {
  /** Present only after an uncertain failure, so a retry cannot apply the week twice. */
  readonly retryKey?: string;
  readonly failure?: HoursFailure;
  readonly notice?: "saved";
}

export type HoursState =
  | { readonly kind: "loading" }
  | { readonly kind: "load-failed"; readonly failure: LoadFailure }
  | ({ readonly kind: "editing" } & Editing & Outcome)
  | ({ readonly kind: "saving"; readonly idempotencyKey: string } & Editing);

export type HoursEvent =
  | { readonly kind: "loaded"; readonly hours: StoredHours }
  | { readonly kind: "load-failed"; readonly failure: LoadFailure }
  | { readonly kind: "draft-changed"; readonly draft: HoursDraft }
  | { readonly kind: "validation-failed"; readonly errors: readonly DayError[] }
  | { readonly kind: "save-started"; readonly idempotencyKey: string }
  | { readonly kind: "save-finished"; readonly result: HoursWrite }
  /** Another command on the shared menu revision guard (D-011) succeeded, e.g. "closed now". */
  | { readonly kind: "revision-advanced"; readonly revision: number };

export type HoursSaveAttempt =
  | { kind: "ready"; idempotencyKey: string; input: HoursInput & { expectedRevision: number } }
  | { kind: "invalid"; errors: DayError[] }
  | { kind: "unavailable" };

export const initialHoursState: HoursState = { kind: "loading" };

function load({ sessionId, revision, weekly, specialDates }: StoredHours): HoursState {
  const draft = toHoursDraft({ weekly, specialDates });
  return { kind: "editing", sessionId, revision, draft, errors: [] };
}

function finishSave(state: HoursState, result: HoursWrite): HoursState {
  if (state.kind !== "saving") return state;
  const { sessionId, revision, draft, idempotencyKey } = state;
  const editing = { kind: "editing", sessionId, draft, errors: [] } as const;
  if (result.kind === "saved") {
    return { ...editing, revision: result.data.revision, notice: "saved" };
  }
  const shouldReuseKey = "shouldReuseKey" in result && result.shouldReuseKey;
  return {
    ...editing,
    revision,
    failure: result.kind,
    ...(shouldReuseKey && { retryKey: idempotencyKey }),
  };
}

function startSave(state: HoursState, idempotencyKey: string): HoursState {
  if (state.kind !== "editing") return state;
  const { sessionId, revision, draft } = state;
  return { kind: "saving", sessionId, revision, draft, errors: [], idempotencyKey };
}

function editDraft(state: HoursState, draft: HoursDraft): HoursState {
  if (state.kind !== "editing") return state;
  const { sessionId, revision } = state;
  return { kind: "editing", sessionId, revision, draft, errors: [] };
}

function advanceRevision(state: HoursState, revision: number): HoursState {
  if (state.kind !== "editing" || revision <= state.revision) return state;
  const { sessionId, draft, errors } = state;
  return { kind: "editing", sessionId, revision, draft, errors };
}

function rejectDraft(state: HoursState, errors: readonly DayError[]): HoursState {
  return state.kind === "editing" ? { ...state, errors } : state;
}

export function reduceHours(state: HoursState, event: HoursEvent): HoursState {
  switch (event.kind) {
    case "loaded":
      return load(event.hours);
    case "load-failed":
      return { kind: "load-failed", failure: event.failure };
    case "draft-changed":
      return editDraft(state, event.draft);
    case "validation-failed":
      return rejectDraft(state, event.errors);
    case "save-started":
      return startSave(state, event.idempotencyKey);
    case "save-finished":
      return finishSave(state, event.result);
    case "revision-advanced":
      return advanceRevision(state, event.revision);
  }
}

/** Validates the draft through the contract and reuses the retry key when one is held. */
export function prepareHoursSave(state: HoursState, createKey: () => string): HoursSaveAttempt {
  if (state.kind !== "editing") return { kind: "unavailable" };
  const validation = toHoursInput(state.draft);
  if (validation.kind === "invalid") return validation;
  return {
    kind: "ready",
    idempotencyKey: state.retryKey ?? createKey(),
    input: { ...validation.input, expectedRevision: state.revision },
  };
}
