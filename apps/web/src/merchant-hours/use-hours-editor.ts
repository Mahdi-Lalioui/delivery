"use client";

import { useEffect, useReducer, useRef, useState, type Dispatch } from "react";
import type { RangeDraft } from "./clock-ranges";
import {
  addHoursRange,
  isDayError,
  removeHoursRange,
  updateHoursRange,
  type HoursDraft,
} from "./hours-editor";
import { initialHoursState, prepareHoursSave, reduceHours, type HoursEvent } from "./hours-flow";
import { isStale, readHours, readHoursPreview, replaceHours } from "./hours-http";
import { useHoursPause } from "./use-hours-pause";
import { useRamadanEditor } from "./use-ramadan-editor";

type RangeAddress = { weekday: number; index: number };
type PreviewRead = Awaited<ReturnType<typeof readHoursPreview>>;
type PreviewView = PreviewRead | { kind: "loading" };
type PreviewSchedule = Parameters<typeof readHoursPreview>[0]["schedule"];
/** A CSS selector inside the hours panel that should receive focus after the last action. */
type FocusRequest = { selector: string };

function rangeCount(draft: HoursDraft, weekday: number): number {
  return draft.weekly.find((day) => day.weekday === weekday)?.ranges.length ?? 0;
}

function useHoursLoad(merchantId: string, version: number, dispatch: Dispatch<HoursEvent>) {
  useEffect(() => {
    const controller = new AbortController();
    void readHours({ merchantId, signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      dispatch(
        result.kind === "ready"
          ? { kind: "loaded", hours: result.data }
          : { kind: "load-failed", failure: result.kind },
      );
    });
    return () => {
      controller.abort();
    };
  }, [merchantId, version, dispatch]);
}

function useHoursPreview(
  merchantId: string,
  revision: number | undefined,
  schedule: PreviewSchedule,
): PreviewView {
  const [preview, setPreview] = useState<PreviewView>({ kind: "loading" });
  useEffect(() => {
    if (revision === undefined) return;
    const controller = new AbortController();
    setPreview({ kind: "loading" });
    void readHoursPreview({ merchantId, schedule, signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setPreview(result);
    });
    return () => {
      controller.abort();
    };
  }, [merchantId, revision, schedule]);
  return preview;
}

export function useHoursEditor(merchantId: string) {
  const [state, dispatch] = useReducer(reduceHours, initialHoursState);
  const [version, setVersion] = useState(0);
  const [focus, setFocus] = useState<FocusRequest>();
  const inFlight = useRef(false);
  useHoursLoad(merchantId, version, dispatch);
  const revision = state.kind === "editing" || state.kind === "saving" ? state.revision : undefined;
  const [previewSchedule, showPreview] = useState<PreviewSchedule>("regular");
  const preview = useHoursPreview(merchantId, revision, previewSchedule);
  const ramadan = useRamadanEditor({
    merchantId,
    version,
    isBlocked: () => state.kind === "saving" || pause.state.kind === "saving",
    onSaved: (saved) => {
      dispatch({ kind: "revision-advanced", revision: saved });
    },
    onFocus: (selector) => {
      setFocus({ selector });
    },
  });
  // Pause, weekly hours and Ramadan share one D-011 revision, so each success advances the others.
  const pause = useHoursPause({
    merchantId,
    version,
    hours: state,
    dispatchHours: (event) => {
      dispatch(event);
      if (event.kind === "revision-advanced") ramadan.advance(event.revision);
    },
    isBlocked: () => ramadan.state.kind === "saving",
    onSettled: (selector) => {
      if (selector) setFocus({ selector });
    },
  });

  function editDraft(change: (draft: HoursDraft) => HoursDraft) {
    if (state.kind !== "editing") return undefined;
    const draft = change(state.draft);
    dispatch({ kind: "draft-changed", draft });
    return draft;
  }

  function change(edit: RangeAddress & { field: keyof RangeDraft; value: string }) {
    editDraft((draft) => updateHoursRange(draft, edit));
  }

  function add(weekday: number) {
    const draft = editDraft((current) => addHoursRange(current, weekday));
    if (!draft) return;
    const index = rangeCount(draft, weekday) - 1;
    setFocus({ selector: `#hours-${String(weekday)}-${String(index)}-opens` });
  }

  function remove(range: RangeAddress) {
    if (!editDraft((draft) => removeHoursRange(draft, range))) return;
    setFocus({ selector: `#hours-${String(range.weekday)}-add` });
  }

  async function save() {
    const isOtherSaving = pause.state.kind === "saving" || ramadan.state.kind === "saving";
    if (inFlight.current || isOtherSaving || state.kind !== "editing") return;
    const attempt = prepareHoursSave(state, () => crypto.randomUUID());
    if (attempt.kind === "unavailable") return;
    if (attempt.kind === "invalid") {
      dispatch({ kind: "validation-failed", errors: attempt.errors });
      // TODO(M2-9): focus a special-date error once its fields exist.
      const first = attempt.errors.find(isDayError);
      if (first) setFocus({ selector: `#hours-${String(first.weekday)}-0-opens` });
      return;
    }
    inFlight.current = true;
    dispatch({ kind: "save-started", idempotencyKey: attempt.idempotencyKey });
    const { sessionId } = state;
    const { idempotencyKey, input } = attempt;
    const result = await replaceHours({ merchantId, sessionId, idempotencyKey, input });
    inFlight.current = false;
    dispatch({ kind: "save-finished", result });
    if (result.kind === "saved") ramadan.advance(result.data.revision);
    setFocus({ selector: isStale(result) ? "[data-hours-reload]" : "[data-hours-save]" });
  }

  function reload() {
    if (inFlight.current) return;
    setFocus(undefined);
    setVersion((current) => current + 1);
  }

  return {
    state,
    preview,
    previewSchedule,
    showPreview,
    pause,
    ramadan: {
      state: ramadan.state,
      edit: ramadan.edit,
      add: ramadan.add,
      remove: ramadan.remove,
      save: ramadan.save,
    },
    focus,
    change,
    add,
    remove,
    save,
    reload,
  };
}

export type MerchantHoursEditor = ReturnType<typeof useHoursEditor>;
