"use client";

import { useEffect, useRef, useState } from "react";
import {
  listAdminMerchantApplications,
  prepareAdminReviewAttempt,
  reviewAdminMerchantApplication,
  type AdminApplication,
  type QueuePageRequest,
  type ReviewAttempt,
  type ReviewDecision,
  type ReviewValidationField,
} from "./admin-merchant-http";

type ReadyQueue = {
  kind: "ready";
  applications: readonly AdminApplication[];
  nextCursor: string | null;
  sessionId: string;
};
type QueueView = ReadyQueue | { kind: "loading" | "error" | "sign-in" | "session-changed" };
type Notice = "pageError" | "saveError" | "stale" | "approved" | "rejected";
type ReviewDraft = { decision: ReviewDecision | ""; reason: string };

export interface AdminMerchantQueueState {
  readonly view: QueueView;
  readonly application: AdminApplication | undefined;
  readonly isPaging: boolean;
  readonly isSaving: boolean;
  readonly notice: Notice | undefined;
  readonly select: (merchantId: string) => void;
  readonly refresh: () => void;
  readonly loadMore: () => void;
  readonly save: (draft: ReviewDraft) => Promise<ReviewValidationField | undefined>;
}

function appendPage(current: QueueView, next: ReadyQueue): ReadyQueue {
  if (current.kind !== "ready") return next;
  const loaded = new Set(current.applications.map(({ merchantId }) => merchantId));
  return {
    ...next,
    applications: [
      ...current.applications,
      ...next.applications.filter(({ merchantId }) => !loaded.has(merchantId)),
    ],
  };
}

export function useAdminMerchantQueue(): AdminMerchantQueueState {
  const [view, setView] = useState<QueueView>({ kind: "loading" });
  const [request, setRequest] = useState<QueuePageRequest>({});
  const [selected, setSelected] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const [isPaging, setPaging] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const isReviewInFlight = useRef(false);
  const attempt = useRef<ReviewAttempt | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    const { cursor } = request;
    void listAdminMerchantApplications({ ...request, signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setPaging(false);
      if (result.kind === "ready") {
        const next: ReadyQueue = { kind: "ready", ...result.page };
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

  function select(merchantId: string) {
    if (view.kind !== "ready" || isReviewInFlight.current || merchantId === selected) return;
    if (!view.applications.some((application) => application.merchantId === merchantId)) return;
    setSelected(merchantId);
    setNotice(undefined);
  }

  function finishReview(
    kind: Awaited<ReturnType<typeof reviewAdminMerchantApplication>>["kind"],
    merchantId: string,
  ) {
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
    setView((current) =>
      current.kind === "ready"
        ? {
            ...current,
            applications: current.applications.filter(
              (application) => application.merchantId !== merchantId,
            ),
          }
        : current,
    );
  }

  async function save(draft: ReviewDraft) {
    if (
      !selected ||
      view.kind !== "ready" ||
      isPaging ||
      isReviewInFlight.current ||
      notice === "stale"
    )
      return;
    const prepared = prepareAdminReviewAttempt({
      merchantId: selected,
      expectedSessionId: view.sessionId,
      ...draft,
      previous: attempt.current,
    });
    if (prepared.kind === "invalid") return prepared.field;

    attempt.current = prepared.attempt;
    isReviewInFlight.current = true;
    setSaving(true);
    setNotice(undefined);
    const { kind } = await reviewAdminMerchantApplication(prepared.attempt);
    isReviewInFlight.current = false;
    setSaving(false);
    finishReview(kind, prepared.attempt.merchantId);
  }

  const application =
    view.kind === "ready"
      ? view.applications.find(({ merchantId }) => merchantId === selected)
      : undefined;
  return { view, application, isPaging, isSaving, notice, select, refresh, loadMore, save };
}
