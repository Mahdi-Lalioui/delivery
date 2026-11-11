"use client";

import { useCallback, useRef, useState } from "react";
import {
  confirmDeletion,
  exportFile,
  exportMyData,
  requestDeletionCode,
  type DeleteResult,
} from "./privacy-http";

type Step = { kind: "idle" } | { kind: "code-sent"; challengeId: string } | { kind: "deleted" };
export type PrivacyState = {
  step: Step;
  isBusy: boolean;
  exportStatus: "idle" | "ready" | "error";
  deleteError: Exclude<DeleteResult["kind"], "deleted"> | "send-error" | undefined;
  downloadExport: () => Promise<void>;
  sendCode: () => Promise<void>;
  confirm: (code: string) => Promise<void>;
  cancel: () => void;
};

/** Attaches the link so every browser starts the download, then frees the object URL. */
export function downloadBlob(blob: Blob, name: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(link.href);
  }, 0);
}

export function usePrivacy(fileName: string): PrivacyState {
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [isBusy, setIsBusy] = useState(false);
  const [exportStatus, setExportStatus] = useState<PrivacyState["exportStatus"]>("idle");
  const [deleteError, setDeleteError] = useState<PrivacyState["deleteError"]>();
  // One key per deletion attempt, so a double tap sends a single SMS.
  const sendKey = useRef<string>(undefined);

  const downloadExport = useCallback(async () => {
    setIsBusy(true);
    const result = await exportMyData();
    setIsBusy(false);
    if (result.kind !== "ready") {
      setExportStatus("error");
      return;
    }
    downloadBlob(exportFile(result.data), fileName);
    setExportStatus("ready");
  }, [fileName]);

  const sendCode = useCallback(async () => {
    sendKey.current ??= crypto.randomUUID();
    setIsBusy(true);
    const result = await requestDeletionCode(sendKey.current);
    setIsBusy(false);
    if (result.kind !== "sent") {
      setDeleteError("send-error");
      return;
    }
    setDeleteError(undefined);
    setStep({ kind: "code-sent", challengeId: result.challengeId });
  }, []);

  const confirm = useCallback(
    async (code: string) => {
      if (step.kind !== "code-sent") return;
      setIsBusy(true);
      const result = await confirmDeletion({ challengeId: step.challengeId, code });
      setIsBusy(false);
      if (result.kind === "deleted") {
        setStep({ kind: "deleted" });
        return;
      }
      if (result.kind === "expired") {
        sendKey.current = undefined;
        setStep({ kind: "idle" });
      }
      setDeleteError(result.kind);
    },
    [step],
  );

  const cancel = useCallback(() => {
    sendKey.current = undefined;
    setDeleteError(undefined);
    setStep({ kind: "idle" });
  }, []);

  return { step, isBusy, exportStatus, deleteError, downloadExport, sendCode, confirm, cancel };
}
