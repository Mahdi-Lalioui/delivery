"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadOrderRating,
  saveOrderRating,
  type RatingDraft,
  type RatingLoad,
  type RatingSave,
} from "./ratings-http";
import { loadOrderHistory } from "./orders-http";

/** Which order is being rated, in the diner's words: the restaurant and the order code. */
export type RatedOrder = { restaurantName: string; shortCode: string };

export function findRatedOrder(
  orders: readonly { orderId: string; restaurantName: string; shortCode: string }[],
  orderId: string,
): RatedOrder | undefined {
  const found = orders.find((order) => order.orderId === orderId);
  return found && { restaurantName: found.restaurantName, shortCode: found.shortCode };
}

export type OrderRatingState = {
  view: RatingLoad | { kind: "loading" };
  outcome: RatingSave | undefined;
  isSaving: boolean;
  save: (draft: RatingDraft) => Promise<void>;
  /** From the first page of history: ratings are for recent orders. Absent, the page stays generic. */
  order?: RatedOrder | undefined;
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
  const [order, setOrder] = useState<RatedOrder>();

  useEffect(() => {
    const controller = new AbortController();
    void loadOrderHistory({ signal: controller.signal }).then((page) => {
      if (!controller.signal.aborted && page.kind === "ready")
        setOrder(findRatedOrder(page.orders, orderId));
    });
    return () => {
      controller.abort();
    };
  }, [orderId]);

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

  return { view, outcome, isSaving, save, order };
}
