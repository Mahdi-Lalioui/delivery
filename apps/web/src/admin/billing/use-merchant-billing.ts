"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadMerchantBilling,
  submitTransferProof,
  type MerchantBillingResult,
  type TransferMethod,
  type TransferKeys,
  type TransferResult,
} from "./merchant-billing-http";

const pollDelayMs = 1500;

type TransferDraft = {
  invoiceId: string;
  method: TransferMethod;
  reference: string;
  file: File | undefined;
};
export type MerchantBillingState = {
  view: MerchantBillingResult | { kind: "loading" };
  outcome: TransferResult | undefined;
  outcomeId: number;
  isSubmitting: boolean;
  refresh: () => void;
  submit: (draft: TransferDraft) => Promise<void>;
};

function waitForPoll(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, pollDelayMs);
  });
}

export function useMerchantBilling(merchantId: string): MerchantBillingState {
  const [view, setView] = useState<MerchantBillingState["view"]>({ kind: "loading" });
  const [outcome, setOutcomeValue] = useState<TransferResult>();
  const [outcomeId, setOutcomeId] = useState(0);
  const setOutcome = useCallback((next: TransferResult) => {
    setOutcomeValue(next);
    setOutcomeId((value) => value + 1);
  }, []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generation, setGeneration] = useState(0);
  const attempt = useRef<{ identity: string; keys: TransferKeys }>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    void loadMerchantBilling(merchantId, controller.signal).then((result) => {
      if (!controller.signal.aborted) setView(result);
    });
    return () => {
      controller.abort();
    };
  }, [merchantId, generation]);

  const refresh = useCallback(() => {
    setGeneration((value) => value + 1);
  }, []);

  const submit = useCallback(
    async ({ file, ...draft }: TransferDraft) => {
      if (file === undefined) {
        setOutcome({ kind: "invalid", field: "file" });
        return;
      }
      const identity = [
        draft.invoiceId,
        draft.method,
        draft.reference,
        file.name,
        file.size,
        file.lastModified,
      ].join("\u0000");
      if (attempt.current?.identity !== identity) {
        attempt.current = {
          identity,
          keys: { reserveKey: crypto.randomUUID(), submitKey: crypto.randomUUID() },
        };
      }
      const { keys } = attempt.current;
      setIsSubmitting(true);
      const result = await submitTransferProof({
        ...draft,
        merchantId,
        file,
        keys,
        wait: waitForPoll,
      });
      if (result.kind === "submitted") attempt.current = undefined;
      setIsSubmitting(false);
      setOutcome(result);
      if (result.kind === "submitted") refresh();
    },
    [merchantId, refresh, setOutcome],
  );

  return { view, outcome, outcomeId, isSubmitting, refresh, submit };
}
