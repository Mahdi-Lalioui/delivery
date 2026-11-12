"use client";

import { orderActionInputs } from "@zaafran/contracts/orders";
import { formatAlgiersTime } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { Badge, Button, Card, ErrorState, SelectField, Skeleton, TextAreaField } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";
import { useMerchantResource } from "../../merchant/use-merchant-resource";
import { forceOrder, readOrderTimeline, type AdminOrder, type OrderDetail } from "./orders-http";

const active = new Set<AdminOrder["status"]>([
  "scheduled",
  "pending_acceptance",
  "accepted",
  "ready",
  "out_for_delivery",
]);

function ForceForm({
  detail,
  onSaved,
  onRefresh,
}: {
  detail: OrderDetail;
  onSaved: () => void;
  onRefresh: () => void;
}) {
  const t = useTranslations("adminOrders");
  const order = detail.order;
  const [status, setStatus] = useState<"idle" | "pending" | "error" | "invalid" | "stale">("idle");
  const attempt = useRef<{ key: string; fingerprint: string }>(null);
  const inFlight = useRef(false);
  const blocked = status === "pending" || status === "stale";

  async function save(form: HTMLFormElement) {
    if (inFlight.current || blocked) return;
    const values = new FormData(form);
    const parsed = orderActionInputs.force.safeParse({
      expectedVersion: order.version,
      to: values.get("decision"),
      reason: values.get("reason"),
    });
    if (!parsed.success) {
      setStatus("invalid");
      return;
    }
    const fingerprint = JSON.stringify(parsed.data);
    if (attempt.current?.fingerprint !== fingerprint)
      attempt.current = { fingerprint, key: crypto.randomUUID() };
    inFlight.current = true;
    setStatus("pending");
    const result = await forceOrder({
      orderId: order.orderId,
      sessionId: detail.sessionId,
      key: attempt.current.key,
      input: parsed.data,
    });
    inFlight.current = false;
    if (result === "saved") {
      onSaved();
      return;
    }
    setStatus(result);
  }

  return (
    <form
      className="admin-order-force"
      aria-label={t("decisionTitle")}
      onSubmit={(event) => {
        event.preventDefault();
        void save(event.currentTarget);
      }}
    >
      <div>
        <h3>{t("decisionTitle")}</h3>
        <p>{t("decisionHint")}</p>
      </div>
      <fieldset disabled={blocked}>
        <SelectField label={t("decision")} name="decision" defaultValue="" required>
          <option value="" disabled>
            {t("choose")}
          </option>
          <option value="cancelled">{t("cancel")}</option>
          {order.fulfilment === "delivery" ? (
            <option value="delivered">{t("deliver")}</option>
          ) : (
            <option value="collected">{t("collect")}</option>
          )}
        </SelectField>
        <TextAreaField label={t("reason")} name="reason" dir="auto" maxLength={500} required />
      </fieldset>
      {status === "error" || status === "invalid" || status === "stale" ? (
        <p role="alert" className="admin-orders-error">
          {t(status)}
        </p>
      ) : null}
      {status === "stale" && <Button onClick={onRefresh}>{t("refresh")}</Button>}
      <Button
        type="submit"
        variant="destructive"
        disabled={blocked}
        isLoading={status === "pending"}
      >
        {t("confirm")}
      </Button>
    </form>
  );
}

function TimelineEvents({ detail, locale }: { detail: OrderDetail; locale: Locale }) {
  const t = useTranslations("adminOrders");
  const orders = useTranslations("retentionOrders");
  if (!detail.events.length) return <p>{t("noEvents")}</p>;
  return (
    <>
      {detail.hasEarlierEvents && <p>{t("earlierEvents")}</p>}
      <ol className="admin-order-events" role="list">
        {detail.events.map((event) => (
          <li key={event.version}>
            <div>
              <strong>{orders(`status_${event.to}`)}</strong>
              <p>{t(`actor_${event.actor}`)}</p>
              {event.reason && <p dir="auto">{event.reason}</p>}
            </div>
            <time dateTime={event.at}>
              <bdi>{formatAlgiersTime(Date.parse(event.at), locale)}</bdi>
            </time>
          </li>
        ))}
      </ol>
    </>
  );
}

export function OrderTimeline({
  orderId,
  sessionId,
  locale,
  onChange,
}: {
  orderId: string;
  sessionId: string;
  locale: Locale;
  onChange: () => void;
}) {
  const t = useTranslations("adminOrders");
  const orders = useTranslations("retentionOrders");
  const read = useCallback(
    (signal: AbortSignal) => readOrderTimeline({ orderId, sessionId, signal }),
    [orderId, sessionId],
  );
  const { view, retry } = useMerchantResource(read);
  const [saved, setSaved] = useState(false);

  return (
    <Card
      title={t("timeline")}
      titleId="admin-order-timeline"
      actions={<Button onClick={retry}>{t("refresh")}</Button>}
    >
      {saved && <p role="status">{t("saved")}</p>}
      {view.kind === "loading" && <Skeleton label={t("loading")} />}
      {view.kind !== "ready" && view.kind !== "loading" && (
        <ErrorState title={t("detailError")} retryLabel={t("refresh")} onRetry={retry} />
      )}
      {view.kind === "ready" && (
        <div className="admin-order-timeline">
          <div className="admin-order-timeline-heading">
            <div>
              <strong>
                <bdi>{view.data.order.restaurantName}</bdi>
              </strong>
              <p>
                <bdi dir="ltr">{view.data.order.shortCode}</bdi>
              </p>
            </div>
            <Badge>{orders(`status_${view.data.order.status}`)}</Badge>
          </div>
          <TimelineEvents detail={view.data} locale={locale} />
          {active.has(view.data.order.status) && (
            <ForceForm
              detail={view.data}
              onRefresh={retry}
              onSaved={() => {
                setSaved(true);
                retry();
                onChange();
              }}
            />
          )}
        </div>
      )}
    </Card>
  );
}
