import { canAdvanceRevision, type RevisionAdvanced } from "./hours-flow";
import type { HoursWrite, RamadanInput, StoredRamadan } from "./hours-http";
import {
  toRamadanDraft,
  toRamadanInput,
  type RamadanDraft,
  type RamadanError,
} from "./ramadan-editor";

type Failure = Exclude<HoursWrite, { kind: "saved" }>;
type RamadanFailure = Failure["kind"];
type LoadFailure = Exclude<RamadanFailure, "rate-limited">;

interface Editing {
  readonly sessionId: string;
  readonly revision: number;
  readonly draft: RamadanDraft;
  readonly errors: readonly RamadanError[];
}
interface Outcome {
  /** Present only after an uncertain failure, so a retry cannot apply the schedule twice. */
  readonly retryKey?: string;
  readonly failure?: RamadanFailure;
  readonly notice?: "saved";
}

export type RamadanState =
  | { readonly kind: "loading" }
  | { readonly kind: "load-failed"; readonly failure: LoadFailure }
  | ({ readonly kind: "editing" } & Editing & Outcome)
  | ({ readonly kind: "saving"; readonly idempotencyKey: string } & Editing);

type RamadanEvent =
  | { readonly kind: "loaded"; readonly ramadan: StoredRamadan }
  | { readonly kind: "load-failed"; readonly failure: LoadFailure }
  | { readonly kind: "draft-changed"; readonly draft: RamadanDraft }
  | { readonly kind: "validation-failed"; readonly errors: readonly RamadanError[] }
  | { readonly kind: "save-started"; readonly idempotencyKey: string }
  | { readonly kind: "save-finished"; readonly result: HoursWrite }
  | RevisionAdvanced;

type RamadanSaveAttempt =
  | { kind: "ready"; idempotencyKey: string; input: RamadanInput & { expectedRevision: number } }
  | { kind: "invalid"; errors: RamadanError[] }
  | { kind: "unavailable" };

export const initialRamadanState: RamadanState = { kind: "loading" };

function finishSave(state: RamadanState, result: HoursWrite): RamadanState {
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

function startSave(state: RamadanState, idempotencyKey: string): RamadanState {
  if (state.kind !== "editing") return state;
  const { sessionId, revision, draft } = state;
  return { kind: "saving", sessionId, revision, draft, errors: [], idempotencyKey };
}

function editDraft(state: RamadanState, draft: RamadanDraft): RamadanState {
  if (state.kind !== "editing") return state;
  const { sessionId, revision } = state;
  return { kind: "editing", sessionId, revision, draft, errors: [] };
}

function advanceRevision(state: RamadanState, change: RevisionAdvanced): RamadanState {
  if (state.kind !== "editing" || !canAdvanceRevision(state, change)) return state;
  const { sessionId, draft, errors, notice } = state;
  return {
    kind: "editing",
    sessionId,
    revision: change.revision,
    draft,
    errors,
    ...(notice && { notice }),
  };
}

export function reduceRamadan(state: RamadanState, event: RamadanEvent): RamadanState {
  switch (event.kind) {
    case "loaded": {
      const { sessionId, revision, schedule } = event.ramadan;
      return { kind: "editing", sessionId, revision, draft: toRamadanDraft(schedule), errors: [] };
    }
    case "load-failed":
      return { kind: "load-failed", failure: event.failure };
    case "draft-changed":
      return editDraft(state, event.draft);
    case "validation-failed":
      return state.kind === "editing" ? { ...state, errors: event.errors } : state;
    case "save-started":
      return startSave(state, event.idempotencyKey);
    case "save-finished":
      return finishSave(state, event.result);
    case "revision-advanced":
      return advanceRevision(state, event);
  }
}

/** Validates the draft through the contract and reuses the retry key when one is held. */
export function prepareRamadanSave(
  state: RamadanState,
  createKey: () => string,
): RamadanSaveAttempt {
  if (state.kind !== "editing") return { kind: "unavailable" };
  const validation = toRamadanInput(state.draft);
  if (validation.kind === "invalid") return validation;
  return {
    kind: "ready",
    idempotencyKey: state.retryKey ?? createKey(),
    input: { ...validation.input, expectedRevision: state.revision },
  };
}
