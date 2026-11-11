"use client";

import { formatAlgiersTime, formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { Badge, ButtonLink, EmptyState, ErrorState, Icon, Skeleton } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PushOptIn } from "./push-opt-in";
import { TrackingMap } from "./tracking-map-view";
import {
  canCancel,
  cancelReasons,
  isTerminal,
  timelineSteps,
  type Tracking,
} from "./tracking-http";
import type { TrackingState } from "./use-tracking";
import "./tracking.css";

function Eta({ tracking, locale }: { tracking: Tracking; locale: Locale }) {
  const translate = useTranslations("tracking");
  const { eta } = tracking.order;
  if (eta === null || isTerminal(tracking.order.status)) return null;
  const from = formatAlgiersTime(new Date(eta.earliestAt), locale);
  const to = formatAlgiersTime(new Date(eta.latestAt), locale);
  const isPickup = tracking.fulfilment === "pickup";
  return (
    <p className="tracking-eta">
      <small>
        <Icon name="clock" size={16} />
        {translate(isPickup ? "etaPickupLabel" : "etaLabel")}
      </small>
      <strong>
        <bdi dir="ltr">{isPickup ? to : translate("etaRange", { from, to })}</bdi>
      </strong>
    </p>
  );
}

function Timeline({ tracking, locale }: { tracking: Tracking; locale: Locale }) {
  const translate = useTranslations("tracking");
  const steps = timelineSteps(tracking.fulfilment, tracking.timeline);
  const lastReached = steps.findLastIndex((step) => step.at !== undefined);
  return (
    <ol className="tracking-timeline" aria-label={translate("timeline")}>
      {steps.map((step, index) => (
        <li
          key={step.key}
          data-state={index < lastReached ? "done" : index === lastReached ? "current" : "next"}
        >
          <span className="tracking-timeline-dot" aria-hidden="true">
            {index < lastReached && <Icon name="check" size={14} />}
          </span>
          <span>{translate(`step_${step.key}`)}</span>
          {step.at !== undefined && (
            <time dateTime={step.at}>{formatAlgiersTime(new Date(step.at), locale)}</time>
          )}
        </li>
      ))}
    </ol>
  );
}

function CodeCard({ tracking }: { tracking: Tracking }) {
  const translate = useTranslations("tracking");
  const isPickup = tracking.fulfilment === "pickup";
  const code = isPickup ? tracking.pickupCode : tracking.deliveryCode;
  if (code === null) return null;
  return (
    <div className="tracking-code" data-kind={tracking.fulfilment}>
      <p>{translate(isPickup ? "pickupCode" : "deliveryCode")}</p>
      <strong dir="ltr">{code}</strong>
      <small>{translate(isPickup ? "pickupCodeHint" : "deliveryCodeHint")}</small>
    </div>
  );
}

function Contacts({ tracking }: { tracking: Tracking }) {
  const translate = useTranslations("tracking");
  const courier = tracking.fulfilment === "delivery" ? tracking.courier : null;
  return (
    <div className="tracking-contacts">
      {courier && (
        <div className="tracking-courier">
          <span className="tracking-avatar" aria-hidden="true">
            <Icon name="bike" size={24} />
          </span>
          <div>
            <small>{translate("courier")}</small>
            <strong>
              <bdi>{courier.firstName}</bdi>
            </strong>
          </div>
          {courier.phone !== null && (
            <a
              className="tracking-call"
              href={`tel:${courier.phone}`}
              aria-label={translate("callCourier", { name: courier.firstName })}
            >
              <Icon name="phone" size={22} />
            </a>
          )}
        </div>
      )}
      {tracking.restaurantPhone !== null && (
        <a className="tracking-call-restaurant" href={`tel:${tracking.restaurantPhone}`}>
          <Icon name="store" size={20} />
          {translate("callRestaurant")}
        </a>
      )}
    </div>
  );
}

function CancelOrder({ state, tracking }: { state: TrackingState; tracking: Tracking }) {
  const translate = useTranslations("tracking");
  const [isAsking, setAsking] = useState(false);
  if (state.cancel.kind === "too-late") return <p role="alert">{translate("cancelTooLate")}</p>;
  if (!canCancel(tracking.order.status)) return null;
  if (!isAsking)
    return (
      <button
        type="button"
        className="tracking-cancel"
        onClick={() => {
          setAsking(true);
        }}
      >
        {translate("cancel")}
      </button>
    );
  return (
    <fieldset className="tracking-cancel-reasons" disabled={state.cancel.kind === "cancelling"}>
      <legend>{translate("cancelWhy")}</legend>
      {cancelReasons.map((reason) => (
        <button
          key={reason}
          type="button"
          onClick={() => {
            state.cancelOrder(translate(`reason_${reason}`));
          }}
        >
          {translate(`reason_${reason}`)}
        </button>
      ))}
      <button
        type="button"
        className="tracking-keep"
        onClick={() => {
          setAsking(false);
        }}
      >
        {translate("keep")}
      </button>
    </fieldset>
  );
}

/** Time, code and timeline; for pickup the code comes before the timeline. */
function LiveDetails({
  tracking,
  locale,
  isLive,
}: {
  tracking: Tracking;
  locale: Locale;
  isLive: boolean;
}) {
  const translate = useTranslations("tracking");
  const isPickup = tracking.fulfilment === "pickup";
  const isWaitingForCourier = !isPickup && tracking.courier === null && isLive;
  return (
    <>
      <Eta tracking={tracking} locale={locale} />
      {isLive && isPickup && <CodeCard tracking={tracking} />}
      <Timeline tracking={tracking} locale={locale} />
      {isLive && !isPickup && <CodeCard tracking={tracking} />}
      {isWaitingForCourier && <p className="tracking-note">{translate("waitingCourier")}</p>}
    </>
  );
}

function Ready({
  state,
  tracking,
  locale,
}: {
  state: TrackingState;
  tracking: Tracking;
  locale: Locale;
}) {
  const translate = useTranslations("tracking");
  const { order } = tracking;
  const isLive = !isTerminal(order.status);
  const showMap = tracking.fulfilment === "delivery";
  return (
    <div className="tracking" data-map={showMap}>
      {tracking.fulfilment === "delivery" ? (
        <TrackingMap tracking={tracking} label={translate("map")} />
      ) : null}
      <section className="tracking-sheet" aria-labelledby="tracking-status">
        <span className="tracking-grip" aria-hidden="true" />
        <div className="tracking-headline">
          <div>
            <p className="tracking-code-line">
              {translate("code", { code: order.shortCode })}
              <bdi>{formatDzd(order.totalDzd, locale)}</bdi>
            </p>
            <h1 id="tracking-status" aria-live="polite">
              {translate(`status_${order.status}`)}
            </h1>
          </div>
          {isLive && <Badge tone="success">{translate("live")}</Badge>}
        </div>
        <LiveDetails tracking={tracking} locale={locale} isLive={isLive} />
        <Contacts tracking={tracking} />
        {isLive && <PushOptIn />}
        <CancelOrder state={state} tracking={tracking} />
        {(order.status === "delivered" || order.status === "collected") && (
          <ButtonLink
            variant="primary"
            href={`/${locale}/orders/${order.orderId}/rating?fulfilment=${tracking.fulfilment}`}
          >
            {translate("rate")}
          </ButtonLink>
        )}
      </section>
    </div>
  );
}

/** CUS-18 / CUS-19 tracking view (page and design gallery). */
export function TrackingView({ state, locale }: { state: TrackingState; locale: Locale }) {
  const translate = useTranslations("tracking");
  const { view } = state;
  if (view.kind === "loading")
    return (
      <div className="tracking" data-map="true">
        <div className="tracking-map tracking-map-loading" aria-hidden="true" />
        <section className="tracking-sheet">
          <Skeleton label={translate("loading")} lines={5} />
        </section>
      </div>
    );
  if (view.kind === "sign-in")
    return (
      <EmptyState
        icon="user"
        title={translate("signIn")}
        action={
          <ButtonLink variant="primary" href={`/${locale}/sign-in`}>
            {translate("signIn")}
          </ButtonLink>
        }
      />
    );
  if (view.kind === "not-found") return <EmptyState icon="receipt" title={translate("notFound")} />;
  if (view.kind !== "ready")
    return (
      <ErrorState
        title={translate("error")}
        retryLabel={translate("retry")}
        onRetry={state.retry}
      />
    );
  return <Ready state={state} tracking={view.tracking} locale={locale} />;
}
