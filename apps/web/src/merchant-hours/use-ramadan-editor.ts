"use client";

import { useEffect, useReducer, useRef } from "react";
import { isStale, readRamadan, replaceRamadan } from "./hours-http";
import {
  addRamadanRange,
  removeRamadanRange,
  type RamadanDraft,
  type RamadanError,
} from "./ramadan-editor";
import { initialRamadanState, prepareRamadanSave, reduceRamadan } from "./ramadan-flow";

type RangeAddress = { weekday: number; index: number };

function errorSelector(error: RamadanError): string {
  if (error.field === "day") return `#ramadan-${String(error.weekday)}-0-opens-kind`;
  return error.field === "suhoor" ? "#ramadan-suhoor-on" : "#ramadan-adjustment";
}

function rangeCount(draft: RamadanDraft, weekday: number): number {
  return draft.weekly.find((day) => day.weekday === weekday)?.ranges.length ?? 0;
}

export function useRamadanEditor({
  merchantId,
  version,
  isBlocked,
  onSaved,
  onFocus,
}: {
  merchantId: string;
  version: number;
  /** True while another command on the shared D-011 revision is in flight. */
  isBlocked: () => boolean;
  onSaved: (revision: number) => void;
  onFocus: (selector: string) => void;
}) {
  const [state, dispatch] = useReducer(reduceRamadan, initialRamadanState);
  const inFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void readRamadan({ merchantId, signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      dispatch(
        result.kind === "ready"
          ? { kind: "loaded", ramadan: result.data }
          : { kind: "load-failed", failure: result.kind },
      );
    });
    return () => {
      controller.abort();
    };
  }, [merchantId, version]);

  function edit(draft: RamadanDraft) {
    dispatch({ kind: "draft-changed", draft });
  }

  function add(weekday: number) {
    if (state.kind !== "editing") return;
    const draft = addRamadanRange(state.draft, weekday);
    edit(draft);
    const index = rangeCount(draft, weekday) - 1;
    onFocus(`#ramadan-${String(weekday)}-${String(index)}-opens-kind`);
  }

  function remove(range: RangeAddress) {
    if (state.kind !== "editing") return;
    edit(removeRamadanRange(state.draft, range));
    onFocus(`#ramadan-${String(range.weekday)}-add`);
  }

  async function save() {
    if (inFlight.current || isBlocked() || state.kind !== "editing") return;
    const attempt = prepareRamadanSave(state, () => crypto.randomUUID());
    if (attempt.kind === "unavailable") return;
    if (attempt.kind === "invalid") {
      dispatch({ kind: "validation-failed", errors: attempt.errors });
      const [first] = attempt.errors;
      if (first) onFocus(errorSelector(first));
      return;
    }
    inFlight.current = true;
    dispatch({ kind: "save-started", idempotencyKey: attempt.idempotencyKey });
    const { sessionId } = state;
    const { idempotencyKey, input } = attempt;
    const result = await replaceRamadan({ merchantId, sessionId, idempotencyKey, input });
    inFlight.current = false;
    dispatch({ kind: "save-finished", result });
    if (result.kind === "saved") onSaved(result.data.revision);
    onFocus(isStale(result) ? "[data-hours-reload]" : "[data-ramadan-save]");
  }

  function advance(revision: number) {
    dispatch({ kind: "revision-advanced", revision });
  }

  return { state, edit, add, remove, save, advance };
}
