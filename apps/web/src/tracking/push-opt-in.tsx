"use client";

import { Icon } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { enablePush, isPushSupported, type PushOutcome } from "./push-http";

type State = "idle" | "working" | PushOutcome;

/** CUS-20: one tap to get status updates for this and future orders. */
export function PushOptIn() {
  const translate = useTranslations("tracking");
  const [state, setState] = useState<State>("unsupported");
  useEffect(() => {
    if (!isPushSupported()) return;
    setState(
      Notification.permission === "granted"
        ? "on"
        : Notification.permission === "denied"
          ? "denied"
          : "idle",
    );
  }, []);
  // Blocked in browser settings: nothing to offer here, so stay out of the way.
  if (state === "unsupported" || state === "denied") return null;
  if (state === "on")
    return (
      <p className="tracking-push" data-state="on" role="status">
        <Icon name="check" size={20} />
        {translate("notifyOn")}
      </p>
    );
  return (
    <div className="tracking-push">
      <Icon name="bell" size={22} />
      <div>
        <strong>{translate("notifyTitle")}</strong>
        <p>{state === "error" ? translate("notifyError") : translate("notifyBody")}</p>
      </div>
      {
        <button
          type="button"
          className="ui-button ui-button-secondary ui-button-sm"
          aria-busy={state === "working"}
          disabled={state === "working"}
          onClick={() => {
            setState("working");
            void enablePush().then(setState);
          }}
        >
          {translate("notifyAction")}
        </button>
      }
    </div>
  );
}
