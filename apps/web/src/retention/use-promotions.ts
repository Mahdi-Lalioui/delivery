"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { emptyPromotionDraft, promotionDraftToInput, type PromotionDraft } from "./promotion-draft";
import { basisPointsToPercent } from "./basis-points";
import {
  listPromotions,
  savePromotion,
  type Promotion,
  type PromotionList,
} from "./promotions-http";

type Outcome = "saved" | "duplicate-code" | "sign-in" | "error" | { invalid: string };
export type PromotionsState = {
  view: PromotionList | { kind: "loading" };
  draft: PromotionDraft;
  editingId: string | undefined;
  outcome: Outcome | undefined;
  outcomeId: number;
  isSaving: boolean;
  change: <Field extends keyof PromotionDraft>(field: Field, value: PromotionDraft[Field]) => void;
  edit: (promotion: Promotion | undefined) => void;
  save: () => Promise<void>;
};

function toText(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

/** Loads a saved promotion back into the editor's text fields. */
function promotionToDraft(promotion: Promotion): PromotionDraft {
  const { activation, discount, conditions } = promotion;
  return {
    ...emptyPromotionDraft,
    activation: activation.kind,
    code: activation.kind === "code" ? activation.code : "",
    discountKind: discount.kind,
    percent: discount.kind === "percent" ? basisPointsToPercent(discount.basisPoints) : "",
    capDzd: discount.kind === "percent" ? String(discount.capDzd) : "",
    amountDzd: discount.kind === "fixed" ? String(discount.amountDzd) : "",
    minimumSubtotalDzd: toText(conditions.minimumSubtotalDzd),
    startsOn: conditions.startsOn ?? "",
    endsOn: conditions.endsOn ?? "",
    isFirstOrderOnly: conditions.firstOrderOnly === true,
    maxUsesTotal: toText(conditions.maxUsesTotal),
    maxUsesPerCustomer: toText(conditions.maxUsesPerCustomer),
  };
}

/** Value comparison, so a rebuilt but equal draft reuses its idempotency key on retry. */
function isSameDraft(left: PromotionDraft, right: PromotionDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function usePromotions(merchantId: string): PromotionsState {
  const [view, setView] = useState<PromotionsState["view"]>({ kind: "loading" });
  const [draft, setDraft] = useState<PromotionDraft>(emptyPromotionDraft);
  const [editingId, setEditingId] = useState<string>();
  const [outcome, setOutcomeValue] = useState<Outcome>();
  const [outcomeId, setOutcomeId] = useState(0);
  const setOutcome = useCallback((next: Outcome | undefined) => {
    setOutcomeValue(next);
    setOutcomeId((value) => value + 1);
  }, []);
  const [isSaving, setIsSaving] = useState(false);
  const [generation, setGeneration] = useState(0);
  const attempt = useRef<{ draft: PromotionDraft; key: string }>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    void listPromotions(merchantId, controller.signal).then((result) => {
      if (!controller.signal.aborted) setView(result);
    });
    return () => {
      controller.abort();
    };
  }, [merchantId, generation]);

  const change = useCallback(
    <Field extends keyof PromotionDraft>(field: Field, value: PromotionDraft[Field]) => {
      setDraft((current) => ({ ...current, [field]: value }));
    },
    [],
  );

  const edit = useCallback(
    (promotion: Promotion | undefined) => {
      setOutcome(undefined);
      setEditingId(promotion?.promotionId);
      setDraft(promotion === undefined ? emptyPromotionDraft : promotionToDraft(promotion));
    },
    [setOutcome],
  );

  const save = useCallback(async () => {
    const parsed = promotionDraftToInput(draft);
    if (parsed.kind === "invalid") {
      setOutcome({ invalid: parsed.field });
      return;
    }
    if (attempt.current === undefined || !isSameDraft(attempt.current.draft, draft)) {
      attempt.current = { draft, key: crypto.randomUUID() };
    }
    const { key } = attempt.current;
    setIsSaving(true);
    const result = await savePromotion({
      merchantId,
      promotionId: editingId,
      promotion: parsed.input,
      key,
    });
    setIsSaving(false);
    setOutcome(result.kind);
    if (result.kind === "saved") {
      attempt.current = undefined;
      setEditingId(result.promotion.promotionId);
      setGeneration((value) => value + 1);
    }
  }, [draft, editingId, merchantId, setOutcome]);

  return { view, draft, editingId, outcome, outcomeId, isSaving, change, edit, save };
}
