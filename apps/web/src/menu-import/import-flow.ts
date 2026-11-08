import type {
  MenuImportApplied,
  MenuImportFailureKind,
  MenuImportInput,
  MenuImportPreview,
  MenuImportPreviewResult,
  MenuImportWrite,
} from "./import-http";

export interface MenuImportDraft {
  readonly fileId: string;
  readonly merchantId: string;
  readonly sessionId: string;
  readonly input: MenuImportInput;
}

interface Reviewed {
  readonly draft: MenuImportDraft;
}
interface Previewed extends Reviewed {
  readonly preview: MenuImportPreview;
}
interface Retry {
  readonly failure?: MenuImportFailureKind;
  readonly retryKey?: string;
}

export type MenuImportState =
  | ({ readonly kind: "editing" } & Pick<Retry, "failure">)
  | ({ readonly kind: "review" } & Reviewed & Pick<Retry, "failure">)
  | ({ readonly kind: "previewing"; readonly requestId: string } & Reviewed)
  | ({ readonly kind: "previewed" } & Previewed & Retry)
  | ({ readonly kind: "applying"; readonly idempotencyKey: string } & Previewed)
  | { readonly kind: "applied"; readonly result: MenuImportApplied };

export type MenuImportEvent =
  | { readonly kind: "file-loaded"; readonly draft: MenuImportDraft }
  | { readonly kind: "rows-changed"; readonly input: MenuImportInput }
  | {
      readonly kind: "context-changed";
      readonly merchantId: string;
      readonly sessionId: string;
      readonly revision: number;
    }
  | { readonly kind: "reset" }
  | { readonly kind: "preview-started"; readonly requestId: string }
  | {
      readonly kind: "preview-finished";
      readonly requestId: string;
      readonly result: MenuImportPreviewResult;
    }
  | { readonly kind: "apply-started"; readonly idempotencyKey: string }
  | {
      readonly kind: "apply-finished";
      readonly idempotencyKey: string;
      readonly result: MenuImportWrite;
    };

export const initialMenuImportState: MenuImportState = { kind: "editing" };

const privateFailures = new Set<MenuImportFailureKind>(["session-changed", "sign-in", "forbidden"]);

function reviewedDraft(draft: MenuImportDraft): MenuImportState {
  return {
    kind: "review",
    draft: {
      ...draft,
      input: {
        expectedRevision: draft.input.expectedRevision,
        rows: draft.input.rows.map((row) => ({ ...row })),
      },
    },
  };
}

function failReview(draft: MenuImportDraft, failure: MenuImportFailureKind): MenuImportState {
  return privateFailures.has(failure)
    ? { kind: "editing", failure }
    : { kind: "review", draft, failure };
}

function changeContext(
  state: MenuImportState,
  context: Extract<MenuImportEvent, { kind: "context-changed" }>,
): MenuImportState {
  if (!("draft" in state)) return state;
  const { draft } = state;
  if (context.merchantId !== draft.merchantId || context.sessionId !== draft.sessionId) {
    return { kind: "editing", failure: "session-changed" };
  }
  if (context.revision === draft.input.expectedRevision) return state;
  return reviewedDraft({ ...draft, input: { ...draft.input, expectedRevision: context.revision } });
}

function startPreview(state: MenuImportState, requestId: string): MenuImportState {
  if (state.kind !== "review" && state.kind !== "previewed") return state;
  return { kind: "previewing", draft: state.draft, requestId };
}

function finishPreview(
  state: MenuImportState,
  event: Extract<MenuImportEvent, { kind: "preview-finished" }>,
): MenuImportState {
  if (state.kind !== "previewing" || state.requestId !== event.requestId) return state;
  const { draft } = state;
  if (event.result.kind !== "ready") return failReview(draft, event.result.kind);

  const preview = event.result.data;
  if (preview.sessionId !== draft.sessionId) return failReview(draft, "session-changed");
  if (preview.revision !== draft.input.expectedRevision) {
    return failReview(draft, "revision-conflict");
  }
  return { kind: "previewed", draft, preview };
}

function startApply(state: MenuImportState, idempotencyKey: string): MenuImportState {
  if (
    state.kind !== "previewed" ||
    state.preview.previewToken === null ||
    state.preview.errors.length > 0
  ) {
    return state;
  }
  const { draft, preview, retryKey } = state;
  return { kind: "applying", draft, preview, idempotencyKey: retryKey ?? idempotencyKey };
}

function finishApply(
  state: MenuImportState,
  event: Extract<MenuImportEvent, { kind: "apply-finished" }>,
): MenuImportState {
  if (state.kind !== "applying" || state.idempotencyKey !== event.idempotencyKey) return state;
  const { result } = event;
  if (result.kind === "saved") return { kind: "applied", result: result.data };

  const { draft, preview, idempotencyKey } = state;
  if ("shouldReuseKey" in result) {
    return {
      kind: "previewed",
      draft,
      preview,
      failure: result.kind,
      ...(result.shouldReuseKey && { retryKey: idempotencyKey }),
    };
  }
  return failReview(draft, result.kind);
}

export function reduceMenuImport(state: MenuImportState, event: MenuImportEvent): MenuImportState {
  switch (event.kind) {
    case "file-loaded":
      return reviewedDraft(event.draft);
    case "rows-changed":
      return "draft" in state ? reviewedDraft({ ...state.draft, input: event.input }) : state;
    case "context-changed":
      return changeContext(state, event);
    case "reset":
      return initialMenuImportState;
    case "preview-started":
      return startPreview(state, event.requestId);
    case "preview-finished":
      return finishPreview(state, event);
    case "apply-started":
      return startApply(state, event.idempotencyKey);
    case "apply-finished":
      return finishApply(state, event);
  }
}
