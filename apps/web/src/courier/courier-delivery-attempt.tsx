"use client";

import { Badge, Button, Icon, TextAreaField } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { recordDeliveryAttempt, type DeliveryAttempt, type Job } from "./courier-http";

export function useDeliveryAttempt(job: Job, offline: boolean) {
  const [local, setLocal] = useState<Job["deliveryAttempt"]>();
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const active = useRef(false);
  const key = useRef<{ action: DeliveryAttempt; value: string } | undefined>(undefined);

  async function record(action: DeliveryAttempt) {
    if (offline || active.current) return;
    active.current = true;
    setPending(true);
    setError(false);
    if (key.current?.action !== action) key.current = { action, value: crypto.randomUUID() };
    const result = await recordDeliveryAttempt(job.order.orderId, action, key.current.value);
    if (result.kind === "ready") setLocal(result.data);
    else setError(true);
    if (result.kind !== "retry") key.current = undefined;
    active.current = false;
    setPending(false);
  }

  const state =
    local && local.callAttempts >= job.deliveryAttempt.callAttempts ? local : job.deliveryAttempt;
  return { state, error, pending, record };
}

export function CourierDeliveryAttempt({
  attempts,
  disabled,
  onFail,
}: {
  attempts: ReturnType<typeof useDeliveryAttempt>;
  disabled: boolean;
  onFail: (reason: string) => void;
}) {
  const t = useTranslations("courier");
  const { state, error, pending, record } = attempts;
  const [reason, setReason] = useState("");
  const [now, setNow] = useState(Date.now);
  const { waitStartedAt, callAttempts } = state;
  useEffect(() => {
    if (!waitStartedAt) return;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1_000);
    return () => {
      clearInterval(timer);
    };
  }, [waitStartedAt]);
  const remaining = waitStartedAt
    ? Math.max(0, Math.ceil((Date.parse(waitStartedAt) + 600_000 - now) / 1_000))
    : 600;
  const clock =
    String(Math.floor(remaining / 60)).padStart(2, "0") +
    ":" +
    String(remaining % 60).padStart(2, "0");

  return (
    <details className="courier-panel courier-disclosure">
      <summary>
        {t("deliveryIssue")}
        <Icon name="chevron" />
      </summary>
      <div className="courier-form">
        <p>{t("failureRule")}</p>
        {error && (
          <p role="alert" className="courier-error">
            {t("callNotSaved")}
          </p>
        )}
        <div className="courier-attempt-meta">
          <Badge tone="info">{t("callCount", { count: callAttempts })}</Badge>
          {waitStartedAt && (
            <Badge tone="warning">
              <bdi>{clock}</bdi>
            </Badge>
          )}
        </div>
        {waitStartedAt === null && (
          <Button
            variant="secondary"
            disabled={disabled}
            isLoading={pending}
            onClick={() => void record("start_wait")}
          >
            {t("startWait")}
          </Button>
        )}
        {waitStartedAt && remaining === 0 && callAttempts >= 2 && (
          <form
            className="courier-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (reason.trim()) onFail(reason.trim());
            }}
          >
            <TextAreaField
              label={t("reason")}
              name="failureReason"
              maxLength={500}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
            <Button variant="destructive" type="submit" disabled={disabled || !reason.trim()}>
              {t("markFailed")}
            </Button>
          </form>
        )}
      </div>
    </details>
  );
}
