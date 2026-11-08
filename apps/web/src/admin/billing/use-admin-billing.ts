"use client";

import { useCallback, useEffect, useState } from "react";
import {
  confirmTransferProof,
  loadAdminBilling,
  prepareVoidInvoice,
  voidInvoice,
  type AdminBillingResult,
} from "./admin-billing-http";

type Notice = "recorded" | "voided" | "stale" | "saveError" | "reasonError";
export type AdminBillingState = {
  view: AdminBillingResult | { kind: "loading" };
  notice: Notice | undefined;
  isSaving: boolean;
  refresh: () => void;
  confirmTransfer: (transferProofId: string, reason: string) => Promise<void>;
  voidInvoice: (invoiceId: string, reason: string) => Promise<void>;
};

function noticeFor(kind: string): Notice {
  if (kind === "recorded" || kind === "voided" || kind === "stale") return kind;
  if (kind === "invalid") return "reasonError";
  return "saveError";
}

export function useAdminBilling(): AdminBillingState {
  const [view, setView] = useState<AdminBillingState["view"]>({ kind: "loading" });
  const [notice, setNotice] = useState<Notice>();
  const [isSaving, setIsSaving] = useState(false);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void loadAdminBilling(controller.signal).then((result) => {
      if (!controller.signal.aborted) setView(result);
    });
    return () => {
      controller.abort();
    };
  }, [generation]);

  const refresh = useCallback(() => {
    setGeneration((value) => value + 1);
  }, []);

  const run = useCallback(
    async (write: () => Promise<{ kind: string }>) => {
      setIsSaving(true);
      const result = await write();
      setIsSaving(false);
      setNotice(noticeFor(result.kind));
      if (result.kind !== "error" && result.kind !== "invalid") refresh();
    },
    [refresh],
  );

  const confirmTransfer = useCallback(
    async (transferProofId: string, reason: string) => {
      if (view.kind !== "ready") return;
      const proof = view.transferProofs.find((row) => row.transferProofId === transferProofId);
      const invoice = view.invoices.find((row) => row.invoiceId === proof?.invoiceId);
      if (proof === undefined || invoice === undefined) {
        setNotice("stale");
        return;
      }
      await run(() => confirmTransferProof({ proof, invoice, reason, key: crypto.randomUUID() }));
    },
    [run, view],
  );

  const voidOne = useCallback(
    async (invoiceId: string, reason: string) => {
      const prepared = prepareVoidInvoice({ invoiceId, reason });
      if (prepared.kind === "invalid") {
        setNotice("reasonError");
        return;
      }
      await run(() => voidInvoice(prepared.attempt));
    },
    [run],
  );

  return { view, notice, isSaving, refresh, confirmTransfer, voidInvoice: voidOne };
}
