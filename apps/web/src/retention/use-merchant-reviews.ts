"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listMerchantReviews,
  replyToReview,
  reportReview,
  type MerchantReview,
  type ReviewPage,
  type ReviewWrite,
} from "./ratings-http";

type Notice = { ratingId: string; action: "reply" | "report"; result: ReviewWrite };
export type MerchantReviewsState = {
  view:
    | Exclude<ReviewPage, { kind: "ready" }>
    | { kind: "loading" }
    | { kind: "ready"; reviews: MerchantReview[]; nextCursor: string | null };
  stars: number | undefined;
  notice: Notice | undefined;
  isSaving: boolean;
  isPaging: boolean;
  filter: (stars: number | undefined) => void;
  loadMore: () => Promise<void>;
  reply: (ratingId: string, body: string) => Promise<void>;
  report: (ratingId: string, reason: string) => Promise<void>;
};

export function useMerchantReviews(merchantId: string): MerchantReviewsState {
  const [view, setView] = useState<MerchantReviewsState["view"]>({ kind: "loading" });
  const [stars, setStars] = useState<number>();
  const [notice, setNotice] = useState<Notice>();
  const [isSaving, setIsSaving] = useState(false);
  const [isPaging, setIsPaging] = useState(false);
  const [generation, setGeneration] = useState(0);
  // One key per (action, review, text) so a retried write is deduplicated.
  const keys = useRef(new Map<string, string>());

  useEffect(() => {
    const controller = new AbortController();
    setView({ kind: "loading" });
    void listMerchantReviews({ merchantId, stars, signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setView(result);
    });
    return () => {
      controller.abort();
    };
  }, [merchantId, stars, generation]);

  const filter = useCallback((next: number | undefined) => {
    setNotice(undefined);
    setStars(next);
  }, []);

  const loadMore = useCallback(async () => {
    if (view.kind !== "ready" || view.nextCursor === null) return;
    setIsPaging(true);
    const page = await listMerchantReviews({ merchantId, stars, cursor: view.nextCursor });
    setIsPaging(false);
    if (page.kind === "ready") {
      setView({
        kind: "ready",
        reviews: [...view.reviews, ...page.reviews],
        nextCursor: page.nextCursor,
      });
    }
  }, [merchantId, stars, view]);

  const write = useCallback(
    async (action: Notice["action"], ratingId: string, text: string) => {
      const identity = `${action}\u0000${ratingId}\u0000${text}`;
      const key = keys.current.get(identity) ?? crypto.randomUUID();
      keys.current.set(identity, key);
      setIsSaving(true);
      const input = { merchantId, ratingId, key };
      const result =
        action === "reply"
          ? await replyToReview({ ...input, body: text })
          : await reportReview({ ...input, reason: text });
      setIsSaving(false);
      setNotice({ ratingId, action, result });
      if (result.kind === "saved") {
        keys.current.delete(identity);
        if (action === "reply") setGeneration((value) => value + 1);
      }
    },
    [merchantId],
  );

  const reply = useCallback(
    (ratingId: string, body: string) => write("reply", ratingId, body),
    [write],
  );
  const report = useCallback(
    (ratingId: string, reason: string) => write("report", ratingId, reason),
    [write],
  );

  return { view, stars, notice, isSaving, isPaging, filter, loadMore, reply, report };
}
