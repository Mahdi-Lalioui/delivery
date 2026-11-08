"use client";

import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import {
  parseMenuImportFile,
  type MenuImportFileError,
  type MenuImportFileResult,
} from "./import-file";
import {
  initialMenuImportState,
  reduceMenuImport,
  type MenuImportEvent,
  type MenuImportState,
} from "./import-flow";
import { applyMenuImport, previewMenuImport, type MenuImportWrite } from "./import-http";

type AccessFailure = "session-changed" | "sign-in" | "forbidden";
interface Snapshot {
  readonly state: MenuImportState;
  readonly pending: boolean;
  readonly fileName: string | null;
  readonly fileError: MenuImportFileError | null;
}

export interface MenuImportControls extends Snapshot {
  readonly chooseFile: (file: File | undefined) => void;
  readonly preview: () => void;
  readonly apply: () => void;
  readonly reset: () => void;
  readonly reload: () => void;
}
type Applying = Extract<MenuImportState, { kind: "applying" }>;
type Previewing = Extract<MenuImportState, { kind: "previewing" }>;
type Operation =
  { kind: "parse" } | { kind: "preview"; request: AbortController } | { kind: "apply" };

export interface MenuImportOptions {
  readonly merchantId: string;
  readonly snapshot: { readonly sessionId: string; readonly revision: number };
  readonly blocked: boolean;
  readonly onSaved: (revision: number) => Promise<void>;
  readonly onAccessChanged: (failure: AccessFailure) => void;
  readonly onReload: () => void;
}

const idle = { state: initialMenuImportState, fileName: null, fileError: null };

function reconcileContext(state: MenuImportState, options: MenuImportOptions): MenuImportState {
  return reduceMenuImport(state, {
    kind: "context-changed",
    merchantId: options.merchantId,
    ...options.snapshot,
  });
}

function accessFailure(state: MenuImportState): AccessFailure | undefined {
  if (state.kind !== "editing") return;
  const { failure } = state;
  if (failure === "session-changed" || failure === "sign-in" || failure === "forbidden") {
    return failure;
  }
}

async function readFile(file: File): Promise<MenuImportFileResult> {
  try {
    return await parseMenuImportFile(file);
  } catch {
    return {
      kind: "invalid_file",
      reason: file.name.toLowerCase().endsWith(".csv") ? "invalid_csv" : "invalid_workbook",
    };
  }
}

export function createMenuImportController(initialOptions: MenuImportOptions) {
  let options = initialOptions;
  let snapshot: Snapshot = { ...idle, pending: options.blocked };
  let active: Operation | undefined;
  let isDisposed = false;
  const listeners = new Set<() => void>();

  function publish(changes: Partial<Snapshot>) {
    const next = { ...snapshot, ...changes, pending: active !== undefined || options.blocked };
    if (
      next.state === snapshot.state &&
      next.pending === snapshot.pending &&
      next.fileName === snapshot.fileName &&
      next.fileError === snapshot.fileError
    ) {
      return;
    }
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function cancel() {
    const current = active;
    active = undefined;
    if (current?.kind === "preview") current.request.abort();
  }

  function clear(state: MenuImportState = initialMenuImportState) {
    cancel();
    publish({ ...idle, state });
  }

  function updateOptions(next: MenuImportOptions) {
    const changedIdentity =
      options.merchantId !== next.merchantId ||
      options.snapshot.sessionId !== next.snapshot.sessionId;
    options = next;
    if (changedIdentity) {
      clear({ kind: "editing", failure: "session-changed" });
      return;
    }

    // The successful apply readback can advance the same session's revision before it resolves.
    const current = snapshot.state;
    const state = current.kind === "applying" ? current : reconcileContext(current, options);
    if (state !== current && active?.kind === "preview") cancel();
    publish({ state });
  }

  function canReplaceFile() {
    return !isDisposed && !options.blocked && active?.kind !== "apply";
  }

  async function loadFile(file: File, operation: Operation) {
    const result = await readFile(file);
    if (active !== operation) return;
    active = undefined;
    if (result.kind === "invalid_file") {
      publish({ fileError: result.reason });
      return;
    }
    const {
      merchantId,
      snapshot: { sessionId, revision },
    } = options;
    const state = reduceMenuImport(snapshot.state, {
      kind: "file-loaded",
      draft: {
        fileId: crypto.randomUUID(),
        merchantId,
        sessionId,
        input: { rows: result.rows, expectedRevision: revision },
      },
    });
    publish({ state });
  }

  function chooseFile(file: File | undefined) {
    if (!canReplaceFile()) return;
    if (!file) {
      clear();
      return;
    }
    cancel();
    const operation = { kind: "parse" } satisfies Operation;
    active = operation;
    publish({ ...idle, fileName: file.name });
    void loadFile(file, operation);
  }

  function finishRequest(operation: Operation, event: MenuImportEvent) {
    if (active !== operation) return;
    active = undefined;
    const state = reduceMenuImport(snapshot.state, event);
    const failure = accessFailure(state);
    if (failure) {
      publish({ ...idle, state });
      options.onAccessChanged(failure);
      return;
    }
    publish({ state: reconcileContext(state, options) });
  }

  async function runPreview(operation: Extract<Operation, { kind: "preview" }>, state: Previewing) {
    const { merchantId, sessionId, input } = state.draft;
    const result = await previewMenuImport({
      merchantId,
      sessionId,
      input,
      signal: operation.request.signal,
    });
    finishRequest(operation, { kind: "preview-finished", requestId: state.requestId, result });
  }

  function preview() {
    if (isDisposed || options.blocked || active) return;
    const current = snapshot.state;
    // Retrying the original apply is how an uncertain write recovers its receipt.
    if (current.kind === "previewed" && current.retryKey !== undefined) return;
    const state = reduceMenuImport(current, {
      kind: "preview-started",
      requestId: crypto.randomUUID(),
    });
    if (state.kind !== "previewing") return;
    const operation = { kind: "preview", request: new AbortController() } satisfies Operation;
    active = operation;
    publish({ state });
    void runPreview(operation, state);
  }

  async function readBack(
    result: Extract<MenuImportWrite, { kind: "saved" }>,
  ): Promise<MenuImportWrite> {
    try {
      await options.onSaved(result.data.revision);
      return result;
    } catch {
      return { kind: "error", shouldReuseKey: true };
    }
  }

  async function runApply(operation: Operation, state: Applying, previewToken: string) {
    const { draft, idempotencyKey } = state;
    const result = await applyMenuImport({
      merchantId: draft.merchantId,
      sessionId: draft.sessionId,
      idempotencyKey,
      input: { ...draft.input, previewToken },
    });
    if (active !== operation) return;
    const confirmed = result.kind === "saved" ? await readBack(result) : result;
    finishRequest(operation, { kind: "apply-finished", idempotencyKey, result: confirmed });
  }

  function apply() {
    if (isDisposed || options.blocked || active) return;
    const current = snapshot.state;
    if (current.kind !== "previewed" || current.preview.previewToken === null) return;
    const state = reduceMenuImport(current, {
      kind: "apply-started",
      idempotencyKey: current.retryKey ?? crypto.randomUUID(),
    });
    if (state.kind !== "applying") return;
    const operation = { kind: "apply" } satisfies Operation;
    active = operation;
    publish({ state });
    void runApply(operation, state, current.preview.previewToken);
  }

  function reset() {
    if (canReplaceFile()) clear();
  }

  function reload() {
    if (!canReplaceFile()) return;
    clear();
    options.onReload();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function dispose() {
    isDisposed = true;
    cancel();
    snapshot = { ...idle, pending: options.blocked };
  }

  return {
    getSnapshot: () => snapshot,
    subscribe,
    updateOptions,
    activate: () => {
      isDisposed = false;
    },
    dispose,
    chooseFile,
    preview,
    apply,
    reset,
    reload,
  };
}

export function useMenuImport(options: MenuImportOptions): MenuImportControls {
  const [controller] = useState(() => createMenuImportController(options));
  useLayoutEffect(() => {
    controller.activate();
    return controller.dispose;
  }, [controller]);
  useLayoutEffect(() => {
    controller.updateOptions(options);
  }, [controller, options]);
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const { chooseFile, preview, apply, reset, reload } = controller;
  return { ...snapshot, chooseFile, preview, apply, reset, reload };
}
