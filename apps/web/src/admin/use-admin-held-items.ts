"use client";

import { useEffect, useRef, useState } from "react";
import {
  listHeldMenuItems,
  prepareHeldItemReview,
  reviewHeldMenuItem,
  type HeldItem,
  type HeldItemReview,
  type HeldPageRequest,
  type HeldReviewDraft,
  type HeldReviewField,
} from "./admin-moderation-http";

type ReadyHeldItems = {
  kind: "ready";
  items: readonly HeldItem[];
  nextCursor: string | null;
  sessionId: string;
};
type HeldView = ReadyHeldItems | { kind: "loading" | "error" | "sign-in" | "session-changed" };
type Notice = "pageError" | "saveError" | "stale" | "approved" | "rejected";
type ReviewKind = Awaited<ReturnType<typeof reviewHeldMenuItem>>["kind"];

export interface AdminHeldItemsState {
  readonly view: HeldView;
  readonly item: HeldItem | undefined;
  readonly isPaging: boolean;
  readonly isSaving: boolean;
  readonly notice: Notice | undefined;
  readonly select: (itemId: string) => void;
  readonly refresh: () => void;
  readonly loadMore: () => void;
  readonly save: (draft: HeldReviewDraft) => Promise<HeldReviewField | undefined>;
}

function appendPage(current: HeldView, next: ReadyHeldItems): ReadyHeldItems {
  if (current.kind !== "ready") return next;
  const loaded = new Set(current.items.map(({ itemId }) => itemId));
  return { ...next, items: [...current.items, ...next.items.filter((i) => !loaded.has(i.itemId))] };
}

function withoutItem(current: HeldView, itemId: string): HeldView {
  if (current.kind !== "ready") return current;
  return { ...current, items: current.items.filter((item) => item.itemId !== itemId) };
}

/** ADM-04: drives the held-item queue and one audited review at a time. */
export function useAdminHeldItems(): AdminHeldItemsState {
  const [view, setView] = useState<HeldView>({ kind: "loading" });
  const [request, setRequest] = useState<HeldPageRequest>({});
  const [selected, setSelected] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const [isPaging, setPaging] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const isReviewInFlight = useRef(false);
  const attempt = useRef<HeldItemReview | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    const { cursor } = request;
    void listHeldMenuItems({ ...request, signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setPaging(false);
      if (result.kind === "ready") {
        const next: ReadyHeldItems = { kind: "ready", ...result.page };
        setView((current) => (cursor ? appendPage(current, next) : next));
      } else if (result.kind === "error" && cursor) {
        setNotice("pageError");
      } else {
        setView({ kind: result.kind });
        setNotice(undefined);
        setSelected(undefined);
        attempt.current = undefined;
      }
    });
    return () => {
      controller.abort();
    };
  }, [request]);

  function refresh() {
    if (isReviewInFlight.current) return;
    attempt.current = undefined;
    setNotice(undefined);
    setSelected(undefined);
    setView({ kind: "loading" });
    setRequest({});
  }

  function loadMore() {
    if (view.kind !== "ready" || !view.nextCursor || isPaging || isReviewInFlight.current) return;
    setPaging(true);
    if (notice === "pageError") setNotice(undefined);
    setRequest({ cursor: view.nextCursor, expectedSessionId: view.sessionId });
  }

  function select(itemId: string) {
    if (view.kind !== "ready" || isReviewInFlight.current || itemId === selected) return;
    if (!view.items.some((item) => item.itemId === itemId)) return;
    setSelected(itemId);
    setNotice(undefined);
  }

  function finishReview(kind: ReviewKind, itemId: string) {
    if (kind === "error") {
      setNotice("saveError");
      return;
    }
    attempt.current = undefined;
    setSelected(undefined);
    if (kind === "sign-in" || kind === "session-changed") {
      setNotice(undefined);
      setView({ kind });
      return;
    }
    setNotice(kind);
    setView((current) => withoutItem(current, itemId));
  }

  async function save(draft: HeldReviewDraft) {
    const isBlocked = isPaging || isReviewInFlight.current || notice === "stale";
    if (!selected || view.kind !== "ready" || isBlocked) return;
    const prepared = prepareHeldItemReview({
      itemId: selected,
      expectedSessionId: view.sessionId,
      ...draft,
      previous: attempt.current,
    });
    if (prepared.kind === "invalid") return prepared.field;

    attempt.current = prepared.attempt;
    isReviewInFlight.current = true;
    setSaving(true);
    setNotice(undefined);
    const { kind } = await reviewHeldMenuItem(prepared.attempt);
    isReviewInFlight.current = false;
    setSaving(false);
    finishReview(kind, prepared.attempt.itemId);
  }

  const item =
    view.kind === "ready" ? view.items.find(({ itemId }) => itemId === selected) : undefined;
  return { view, item, isPaging, isSaving, notice, select, refresh, loadMore, save };
}
