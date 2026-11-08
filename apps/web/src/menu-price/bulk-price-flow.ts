import type {
  BulkPriceBatch,
  BulkPricePreview,
  BulkPriceSelection,
  BulkPriceWrite,
} from "./bulk-price-http";

type Failure = Exclude<BulkPriceWrite, { kind: "saved" }>;
type BulkPriceFailure = Failure["kind"];

interface Previewed {
  readonly selection: BulkPriceSelection;
  readonly preview: BulkPricePreview;
}
interface Applied {
  readonly batch: BulkPriceBatch;
  readonly appliedAtMs: number;
  readonly isUndoClosed: boolean;
}
interface Retry {
  readonly retryKey?: string;
  readonly failure?: BulkPriceFailure;
}

export type BulkPriceState =
  | ({ readonly kind: "editing" } & Pick<Retry, "failure">)
  | ({ readonly kind: "previewed" } & Previewed & Retry)
  | ({ readonly kind: "applying"; readonly idempotencyKey: string } & Previewed)
  | ({ readonly kind: "applied" } & Applied & Retry)
  | ({ readonly kind: "undoing"; readonly idempotencyKey: string } & Applied)
  | { readonly kind: "undone"; readonly batch: BulkPriceBatch };

export type BulkPriceEvent =
  | ({ readonly kind: "preview-loaded" } & Previewed)
  | { readonly kind: "preview-failed"; readonly failure: BulkPriceFailure }
  | { readonly kind: "selection-changed" | "reset" }
  | { readonly kind: "apply-started" | "undo-started"; readonly idempotencyKey: string }
  | { readonly kind: "apply-finished"; readonly result: BulkPriceWrite; readonly atMs: number }
  | { readonly kind: "undo-finished"; readonly result: BulkPriceWrite };

export const initialBulkPriceState: BulkPriceState = { kind: "editing" };

const closesUndo = new Set<BulkPriceFailure>(["undo-expired", "price-changed", "already-undone"]);

function retryFields(failure: Failure, idempotencyKey: string): Retry {
  const shouldReuseKey = "shouldReuseKey" in failure && failure.shouldReuseKey;
  return { ...(shouldReuseKey && { retryKey: idempotencyKey }), failure: failure.kind };
}

function finishApply(
  state: BulkPriceState,
  { result, atMs }: Extract<BulkPriceEvent, { kind: "apply-finished" }>,
): BulkPriceState {
  if (state.kind !== "applying") return state;
  if (result.kind === "saved") {
    return { kind: "applied", batch: result.data, appliedAtMs: atMs, isUndoClosed: false };
  }
  const { selection, preview, idempotencyKey } = state;
  if (result.kind === "error" || result.kind === "rate-limited") {
    return { kind: "previewed", selection, preview, ...retryFields(result, idempotencyKey) };
  }
  return { kind: "editing", failure: result.kind };
}

function finishUndo(
  state: BulkPriceState,
  { result }: Extract<BulkPriceEvent, { kind: "undo-finished" }>,
): BulkPriceState {
  if (state.kind !== "undoing") return state;
  if (result.kind === "saved") return { kind: "undone", batch: result.data };
  const { batch, appliedAtMs, idempotencyKey } = state;
  const isUndoClosed = closesUndo.has(result.kind);
  return {
    kind: "applied",
    batch,
    appliedAtMs,
    isUndoClosed,
    ...retryFields(result, idempotencyKey),
  };
}

function failPreview(state: BulkPriceState, failure: BulkPriceFailure): BulkPriceState {
  if (state.kind !== "editing" && state.kind !== "previewed") return state;
  return { kind: "editing", failure };
}

function startApply(state: BulkPriceState, idempotencyKey: string): BulkPriceState {
  if (state.kind !== "previewed") return state;
  const { selection, preview } = state;
  return { kind: "applying", selection, preview, idempotencyKey };
}

function startUndo(state: BulkPriceState, idempotencyKey: string): BulkPriceState {
  if (state.kind !== "applied" || state.isUndoClosed) return state;
  const { batch, appliedAtMs, isUndoClosed } = state;
  return { kind: "undoing", batch, appliedAtMs, isUndoClosed, idempotencyKey };
}

export function reduceBulkPrice(state: BulkPriceState, event: BulkPriceEvent): BulkPriceState {
  switch (event.kind) {
    case "preview-loaded":
      return { kind: "previewed", selection: event.selection, preview: event.preview };
    case "preview-failed":
      return failPreview(state, event.failure);
    case "selection-changed":
      return state.kind === "previewed" ? initialBulkPriceState : state;
    case "reset":
      return initialBulkPriceState;
    case "apply-started":
      return startApply(state, event.idempotencyKey);
    case "apply-finished":
      return finishApply(state, event);
    case "undo-started":
      return startUndo(state, event.idempotencyKey);
    case "undo-finished":
      return finishUndo(state, event);
  }
}
