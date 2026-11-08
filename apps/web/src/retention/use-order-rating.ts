"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadOrderRating,
  saveOrderRating,
  type RatingDraft,
  type RatingLoad,
  type RatingSave,
} from "./ratings-http";

export type OrderRatingState = {
  view: RatingLoad | { kind: "loading" };
  outcome: RatingSave | undefined;
  isSaving: boolean;
  save: (draft: RatingDraft) => Promise<void>;
};

function sameDraft(left: RatingDraft, right: RatingDraft): boolean {
  return (
    left.foodStars === right.foodStars &&
    left.deliveryStars === right.deliveryStars &&
    left.comment === right.comment
  );
}

export function useOrderRating(orderId: string, isDelivery: boolean): OrderRatingState {
  const [view, setView] = useState<OrderRatingState["view"]>({ kind: "loading" });
  const [outcome, setOutcome] = useState<RatingSave>();
  const [isSaving, setIsSaving] = useState(false);
  const attempt = useRef<{ draft: RatingDraft; key: string }>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    void loadOrderRating(orderId, controller.signal).then((result) => {
      if (!controller.signal.aborted) setView(result);
    });
    return () => {
      controller.abort();
    };
  }, [orderId]);

  const save = useCallback(
    async (draft: RatingDraft) => {
      if (attempt.current === undefined || !sameDraft(attempt.current.draft, draft)) {
        attempt.current = { draft, key: crypto.randomUUID() };
      }
      const { key } = attempt.current;
      setIsSaving(true);
      const result = await saveOrderRating({ orderId, draft, isDelivery, key });
      setIsSaving(false);
      setOutcome(result);
      if (result.kind === "saved") {
        attempt.current = undefined;
        setView({ kind: "ready", rating: result.rating });
      }
    },
    [orderId, isDelivery],
  );

  return { view, outcome, isSaving, save };
}
