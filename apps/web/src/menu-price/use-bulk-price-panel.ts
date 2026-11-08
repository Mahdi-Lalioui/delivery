"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { BulkPriceControls } from "./bulk-price-controls";
import { isUndoOffered, undoClosesAtMs } from "./bulk-price-editor";
import { initialBulkPriceState, reduceBulkPrice } from "./bulk-price-flow";
import {
  type BulkFormPatch,
  changeBulkForm,
  makeBulkPriceForm,
  readBulkSelection,
  toggleAllBulkItems,
  toggleBulkItem,
} from "./bulk-price-form";
import { applyBulkPrices, previewBulkPrices, undoBulkPrices } from "./bulk-price-http";

interface MenuSnapshot {
  readonly sessionId: string;
  readonly revision: number;
  readonly items: readonly { readonly itemId: string }[];
}

interface PanelOptions {
  readonly merchantId: string;
  readonly snapshot: MenuSnapshot;
  readonly isBlocked: boolean;
  readonly onSaved: (revision: number) => Promise<void>;
}

// Re-renders once the local undo window closes; the server still decides on every undo.
function useUndoDeadline(appliedAtMs: number | undefined) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (appliedAtMs === undefined) return;
    setNowMs(Date.now());
    const timer = setTimeout(
      () => {
        setNowMs(Date.now());
      },
      Math.max(0, undoClosesAtMs(appliedAtMs) - Date.now()),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [appliedAtMs]);
  return appliedAtMs !== undefined && isUndoOffered({ appliedAtMs, nowMs });
}

function useSerialRequests() {
  const [isPending, setPending] = useState(false);
  const inFlight = useRef(false);
  const controller = useRef(new AbortController());
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    return () => {
      current.abort();
    };
  }, []);
  async function runOnce(task: (signal: AbortSignal) => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      await task(controller.current.signal);
    } finally {
      inFlight.current = false;
      if (!controller.current.signal.aborted) setPending(false);
    }
  }
  return { isPending, runOnce };
}

export function useBulkPricePanel(options: PanelOptions): BulkPriceControls {
  const { merchantId, snapshot, onSaved } = options;
  const [form, setForm] = useState(makeBulkPriceForm);
  const [state, dispatch] = useReducer(reduceBulkPrice, initialBulkPriceState);
  const { isPending, runOnce } = useSerialRequests();
  const appliedAtMs = "appliedAtMs" in state ? state.appliedAtMs : undefined;
  const isUndoVisible = useUndoDeadline(appliedAtMs);
  const itemIds = snapshot.items.map((item) => item.itemId);

  function edit(next: (previous: typeof form) => typeof form) {
    setForm(next);
    dispatch({ kind: "selection-changed" });
  }

  function preview() {
    const read = readBulkSelection(form, itemIds);
    if (read.kind === "invalid") {
      setForm({ ...form, formError: read.formError });
      return;
    }
    void runOnce(async (signal) => {
      const result = await previewBulkPrices({ merchantId, selection: read.selection, signal });
      if (signal.aborted) return;
      if (result.kind === "ready") {
        dispatch({ kind: "preview-loaded", selection: read.selection, preview: result.data });
      } else {
        dispatch({ kind: "preview-failed", failure: result.kind });
      }
    });
  }

  function apply() {
    if (state.kind !== "previewed") return;
    const idempotencyKey = state.retryKey ?? crypto.randomUUID();
    const { selection, preview: bound } = state;
    void runOnce(async (signal) => {
      dispatch({ kind: "apply-started", idempotencyKey });
      const result = await applyBulkPrices({
        merchantId,
        sessionId: bound.sessionId,
        idempotencyKey,
        input: { ...selection, expectedRevision: bound.revision },
      });
      if (signal.aborted) return;
      dispatch({ kind: "apply-finished", result, atMs: Date.now() });
      if (result.kind === "saved") await onSaved(result.data.revision);
    });
  }

  function undo() {
    if (state.kind !== "applied" || state.isUndoClosed) return;
    const idempotencyKey = state.retryKey ?? crypto.randomUUID();
    const { batchId } = state.batch;
    void runOnce(async (signal) => {
      dispatch({ kind: "undo-started", idempotencyKey });
      const result = await undoBulkPrices({
        merchantId,
        sessionId: snapshot.sessionId,
        idempotencyKey,
        batchId,
        expectedRevision: snapshot.revision,
      });
      if (signal.aborted) return;
      dispatch({ kind: "undo-finished", result });
      if (result.kind === "saved") await onSaved(result.data.revision);
    });
  }

  return {
    form,
    state,
    isUndoOffered: isUndoVisible,
    pending: isPending || options.isBlocked,
    changeForm: (patch: BulkFormPatch) => {
      edit((previous) => changeBulkForm(previous, patch));
    },
    toggleItem: (itemId) => {
      edit((previous) => toggleBulkItem(previous, itemId));
    },
    toggleAll: () => {
      edit((previous) => toggleAllBulkItems(previous, itemIds));
    },
    preview,
    apply,
    undo,
    reset: () => {
      setForm(makeBulkPriceForm());
      dispatch({ kind: "reset" });
    },
  };
}
