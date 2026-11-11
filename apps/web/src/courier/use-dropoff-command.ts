"use client";

import { useToast } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { confirmCourierDelivery, failCourierDelivery, type Job, type Proof } from "./courier-http";

type Command = { kind: "deliver"; proof: Proof } | { kind: "fail"; reason: string };
type DropoffError = "wrongCode" | "lockedCode" | "waitForFailure" | "error";

function commandError(code: string | undefined): DropoffError {
  switch (code) {
    case "invalid_delivery_code":
      return "wrongCode";
    case "delivery_code_locked":
      return "lockedCode";
    case "order_not_due":
      return "waitForFailure";
    default:
      return "error";
  }
}

export function useDropoffCommand(job: Job, refresh: () => void) {
  const t = useTranslations("courier");
  const toast = useToast();
  const [state, setState] = useState<"idle" | "saving" | "saved" | DropoffError>("idle");
  const pending = useRef<{ key: string; fingerprint: string } | undefined>(undefined);
  const running = useRef(false);

  async function submit(command: Command) {
    if (running.current) return;
    running.current = true;
    const fingerprint = JSON.stringify(command);
    if (pending.current?.fingerprint !== fingerprint) {
      pending.current = { key: crypto.randomUUID(), fingerprint };
    }
    const { key } = pending.current;
    setState("saving");
    const result =
      command.kind === "deliver"
        ? await confirmCourierDelivery(job, command.proof, key)
        : await failCourierDelivery(job, command.reason, key);
    if (result.kind === "ready") {
      setState("saved");
      toast.show(t(command.kind === "deliver" ? "deliveryComplete" : "deliveryFailed"));
      refresh();
      return;
    }
    running.current = false;
    if (result.kind !== "retry") pending.current = undefined;
    setState(commandError(result.code));
    if (result.code === "order_conflict" || result.code === "order_terminal") refresh();
  }

  const error = state === "idle" || state === "saving" || state === "saved" ? undefined : state;
  return { submit, error, busy: state === "saving" || state === "saved" };
}
