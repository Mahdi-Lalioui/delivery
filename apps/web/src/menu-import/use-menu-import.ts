"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { MenuImportControls } from "./import-controls";
import { type MenuImportFileError, parseMenuImportFile } from "./import-file";
import {
  initialMenuImportState,
  type MenuImportEvent,
  type MenuImportState,
  reduceMenuImport,
} from "./import-flow";
import { applyMenuImport, previewMenuImport, type MenuImportFailureKind } from "./import-http";

type AccessFailure = Extract<MenuImportFailureKind, "session-changed" | "sign-in" | "forbidden">;

export interface MenuImportOptions {
  readonly merchantId: string;
  readonly snapshot: { readonly sessionId: string; readonly revision: number };
  readonly blocked: boolean;
  readonly onSaved: (revision: number) => Promise<void>;
  readonly onAccessChanged: (failure: AccessFailure) => void;
  readonly onReload: () => void;
}

interface MenuImportSnapshot {
  readonly state: MenuImportState;
  readonly pending: boolean;
  readonly fileName: string | null;
  readonly fileError: MenuImportFileError | null;
}

const idleSnapshot: MenuImportSnapshot = {
  state: initialMenuImportState,
  pending: false,
  fileName: null,
  fileError: null,
};

const accessFailures = new Set<MenuImportFailureKind>(["session-changed", "sign-in", "forbidden"]);

function isAccessFailure(failure: MenuImportFailureKind | undefined): failure is AccessFailure {
  return failure !== undefined && accessFailures.has(failure);
}

// Read through a call so TypeScript does not keep an earlier narrowing across an await.
function isCancelled(signal: AbortSignal): boolean {
  return signal.aborted;
}

function readAccessFailure(state: MenuImportState): AccessFailure | undefined {
  if (state.kind !== "editing") return undefined;
  return isAccessFailure(state.failure) ? state.failure : undefined;
}

/**
 * Owns one import at a time. Every asynchronous step holds an operation token, so a newer file,
 * a session change, a reload or unmount discards late parser and network results.
 */
export function createMenuImportController(initial: MenuImportOptions) {
  let options = initial;
  let snapshot = idleSnapshot;
  let operation: AbortController | undefined;
  const listeners = new Set<() => void>();

  function publish(next: Partial<MenuImportSnapshot>) {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  }

  function dispatch(event: MenuImportEvent) {
    publish({ state: reduceMenuImport(snapshot.state, event) });
  }

  function cancel() {
    operation?.abort();
    operation = undefined;
  }

  function start(): AbortSignal {
    cancel();
    operation = new AbortController();
    publish({ pending: true });
    return operation.signal;
  }

  function finish(signal: AbortSignal) {
    if (signal.aborted) return;
    operation = undefined;
    publish({ pending: false });
  }

  function clearPrivate(failure?: AccessFailure) {
    cancel();
    publish({
      state: failure ? { kind: "editing", failure } : initialMenuImportState,
      pending: false,
      fileName: null,
      fileError: null,
    });
  }

  function settle() {
    const failure = readAccessFailure(snapshot.state);
    if (!failure) return;
    clearPrivate(failure);
    options.onAccessChanged(failure);
  }

  function canStart() {
    return !options.blocked && operation === undefined;
  }

  async function loadFile(file: File, signal: AbortSignal) {
    const result = await parseMenuImportFile(file).catch(() => ({
      kind: "invalid_file" as const,
      reason: "invalid_workbook" as const,
    }));
    if (signal.aborted) return;
    if (result.kind === "invalid_file") {
      dispatch({ kind: "reset" });
      publish({ fileError: result.reason });
    } else {
      const { merchantId, snapshot: menu } = options;
      const input = { rows: result.rows, expectedRevision: menu.revision };
      const draft = { fileId: crypto.randomUUID(), merchantId, sessionId: menu.sessionId, input };
      dispatch({ kind: "file-loaded", draft });
    }
    finish(signal);
  }

  function chooseFile(file: File | undefined) {
    if (options.blocked) return;
    if (!file) {
      clearPrivate();
      return;
    }
    const signal = start();
    dispatch({ kind: "reset" });
    publish({ fileName: file.name, fileError: null });
    void loadFile(file, signal);
  }

  async function runPreview(signal: AbortSignal) {
    const { state } = snapshot;
    if (state.kind !== "review" && state.kind !== "previewed") return;
    const { draft } = state;
    const requestId = crypto.randomUUID();
    dispatch({ kind: "preview-started", requestId });
    const result = await previewMenuImport({ ...draft, signal });
    if (signal.aborted) return;
    dispatch({ kind: "preview-finished", requestId, result });
    finish(signal);
    settle();
  }

  function preview() {
    const { kind } = snapshot.state;
    if (!canStart() || (kind !== "review" && kind !== "previewed")) return;
    void runPreview(start());
  }

  async function runApply(signal: AbortSignal) {
    dispatch({ kind: "apply-started", idempotencyKey: crypto.randomUUID() });
    const { state } = snapshot;
    const previewToken = state.kind === "applying" ? state.preview.previewToken : null;
    if (state.kind !== "applying" || previewToken === null) {
      finish(signal);
      return;
    }
    const { draft, preview: bound, idempotencyKey } = state;
    const result = await applyMenuImport({
      merchantId: draft.merchantId,
      sessionId: draft.sessionId,
      idempotencyKey,
      input: { rows: draft.input.rows, expectedRevision: bound.revision, previewToken },
    });
    if (signal.aborted) return;
    // Read the saved menu back before showing the receipt, so an account change wins.
    if (result.kind === "saved") await options.onSaved(result.data.revision);
    if (isCancelled(signal)) return;
    dispatch({ kind: "apply-finished", idempotencyKey, result });
    finish(signal);
    settle();
  }

  function apply() {
    const { state } = snapshot;
    if (!canStart() || state.kind !== "previewed") return;
    if (state.preview.previewToken === null || state.preview.errors.length > 0) return;
    void runApply(start());
  }

  function updateOptions(next: MenuImportOptions) {
    const previous = options;
    options = next;
    const isSameAccount =
      next.merchantId === previous.merchantId &&
      next.snapshot.sessionId === previous.snapshot.sessionId;
    if (!isSameAccount) {
      if ("draft" in snapshot.state || snapshot.pending) clearPrivate("session-changed");
      return;
    }
    // The import's own commit raises the revision while it is applying; keep that request.
    const { revision } = next.snapshot;
    if (revision === previous.snapshot.revision || snapshot.state.kind === "applying") return;
    if (snapshot.state.kind === "previewing") {
      cancel();
      publish({ pending: false });
    }
    dispatch({ kind: "context-changed", merchantId: next.merchantId, ...next.snapshot });
  }

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    chooseFile,
    preview,
    apply,
    reset: () => {
      clearPrivate();
    },
    reload: () => {
      clearPrivate();
      options.onReload();
    },
    updateOptions,
    dispose: cancel,
  };
}

function getServerSnapshot() {
  return idleSnapshot;
}

export function useMenuImport(options: MenuImportOptions): MenuImportControls {
  const [controller] = useState(() => createMenuImportController(options));
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    controller.updateOptions(options);
  });
  useEffect(() => controller.dispose, [controller]);

  return {
    ...snapshot,
    pending: snapshot.pending || options.blocked,
    chooseFile: controller.chooseFile,
    preview: controller.preview,
    apply: controller.apply,
    reset: controller.reset,
    reload: controller.reload,
  };
}
