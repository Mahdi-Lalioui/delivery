"use client";

import { useEffect, useReducer, useRef, useState, type Dispatch } from "react";
import {
  addHoursRange,
  addSpecialDate,
  addSpecialDateRange,
  changeSpecialDate,
  changeSpecialDateRange,
  removeHoursRange,
  removeSpecialDate,
  removeSpecialDateRange,
  updateHoursRange,
  type HoursDraft,
  type HoursError,
  type RangeDraft,
  type SpecialDateRangeAddress,
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

function validationFocus(error: HoursError): string {
  if ("weekday" in error) return `#hours-${String(error.weekday)}-0-opens`;
  const prefix = `#hours-special-${error.dateId}`;
  if (error.reason === "time") return `${prefix}-${String(error.index)}-${error.field}`;
  if (error.reason === "overlap") return `${prefix}-0-opens`;
  return `${prefix}-date`;
}

function specialDateControls({
  draft,
  editDraft,
  onFocus,
}: {
  draft: HoursDraft | undefined;
  editDraft: (change: (draft: HoursDraft) => HoursDraft) => HoursDraft | undefined;
  onFocus: (selector: string) => void;
}) {
  return {
    addDate() {
      const id = crypto.randomUUID();
      if (editDraft((current) => addSpecialDate(current, id))) onFocus(`#hours-special-${id}-date`);
    },
    changeDate(change: { dateId: string; value: string }) {
      editDraft((current) => changeSpecialDate(current, change));
    },
    removeDate(dateId: string) {
      const index = draft?.specialDates.findIndex(({ id }) => id === dateId) ?? -1;
      if (index < 0) return;
      const updated = editDraft((current) => removeSpecialDate(current, dateId));
      if (!updated) return;
      const neighbor = updated.specialDates[index] ?? updated.specialDates.at(-1);
      onFocus(neighbor ? `#hours-special-${neighbor.id}-date` : "#hours-special-add");
    },
    addRange(dateId: string) {
      const updated = editDraft((current) => addSpecialDateRange(current, dateId));
      const entry = updated?.specialDates.find(({ id }) => id === dateId);
      if (entry) onFocus(`#hours-special-${dateId}-${String(entry.ranges.length - 1)}-opens`);
    },
    changeRange(change: SpecialDateRangeAddress & { field: keyof RangeDraft; value: string }) {
      editDraft((current) => changeSpecialDateRange(current, change));
    },
    removeRange(range: SpecialDateRangeAddress) {
      if (editDraft((current) => removeSpecialDateRange(current, range))) {
        onFocus(`#hours-special-${range.dateId}-add-range`);
      }
    },
  };
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
  const [previewSchedule, showPreview] = useState<PreviewSchedule>("regular");
  const ramadan = useRamadanEditor({
    merchantId,
    version,
    isBlocked: () => state.kind === "saving" || pause.state.kind === "saving",
    onSaved: dispatch,
    onFocus: (selector) => {
      setFocus({ selector });
    },
  });
  // A pause success can advance both drafts on the same D-011 snapshot.
  const pause = useHoursPause({
    merchantId,
    version,
    hours: state,
    onSaved: (event) => {
      dispatch(event);
      ramadan.advance(event);
    },
    isBlocked: () => ramadan.state.kind === "saving",
    onSettled: (selector) => {
      if (selector) setFocus({ selector });
    },
  });
  // Refresh the preview even when a saved Ramadan edit leaves a stale weekly draft in place.
  const ramadanRevision = "revision" in ramadan.state ? ramadan.state.revision : 0;
  const previewRevision =
    "revision" in state ? Math.max(state.revision, ramadanRevision) : undefined;
  const preview = useHoursPreview(merchantId, previewRevision, previewSchedule);

  function editDraft(change: (draft: HoursDraft) => HoursDraft) {
    if (state.kind !== "editing") return undefined;
    const draft = change(state.draft);
    if (draft === state.draft) return undefined;
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
      const first = attempt.errors[0];
      if (first) setFocus({ selector: validationFocus(first) });
      return;
    }
    inFlight.current = true;
    dispatch({ kind: "save-started", idempotencyKey: attempt.idempotencyKey });
    const { sessionId } = state;
    const { idempotencyKey, input } = attempt;
    const result = await replaceHours({ merchantId, sessionId, idempotencyKey, input });
    inFlight.current = false;
    dispatch({ kind: "save-finished", result });
    if (result.kind === "saved") {
      ramadan.advance({
        kind: "revision-advanced",
        sessionId,
        expectedRevision: input.expectedRevision,
        revision: result.data.revision,
      });
    }
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
    specialDates: specialDateControls({
      draft: state.kind === "editing" ? state.draft : undefined,
      editDraft,
      onFocus: (selector) => {
        setFocus({ selector });
      },
    }),
    focus,
    change,
    add,
    remove,
    save,
    reload,
  };
}

export type MerchantHoursEditor = ReturnType<typeof useHoursEditor>;
