"use client";

import { formatDzd } from "@zaafran/i18n/formats";
import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { Badge, Button, Icon } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { AlgeriaMap } from "../maps/algeria-map";
import { useDeliveryAttempt } from "./courier-delivery-attempt";
import { CourierDropoff } from "./courier-dropoff";
import { confirmCourierPickup, type Job } from "./courier-http";
import { CourierNavigation } from "./courier-navigation";
import { SlideConfirm } from "./slide-confirm";

function DeliverySteps({ active }: { active: boolean }) {
  const t = useTranslations("courier");
  return (
    <ol className="courier-steps">
      <li aria-current={active ? undefined : "step"}>
        <span className="courier-step-icon">
          <Icon name={active ? "check" : "bag"} />
        </span>
        {t("pickup")}
      </li>
      <li aria-current={active ? "step" : undefined}>
        <span className="courier-step-icon">
          <Icon name="flag" />
        </span>
        {t("dropoff")}
      </li>
    </ol>
  );
}

function JobAddress({
  job,
  locale,
  active,
  onCall,
}: {
  job: Job;
  locale: Locale;
  active: boolean;
  onCall: () => void;
}) {
  const t = useTranslations("courier");
  const { dropoff, pickup, customerFirstName, customerPhone } = job;
  const fields = [
    [t("building"), dropoff.building],
    [t("floor"), dropoff.floor],
    [t("apartment"), dropoff.apartment],
    [t("plusCode"), dropoff.plusCode],
  ];
  return (
    <section className="courier-panel courier-address" aria-labelledby="courier-address-title">
      <h3 id="courier-address-title">{t(active ? "dropoffAddress" : "pickupAddress")}</h3>
      <p className="courier-address-name">
        <bdi>{active ? (customerFirstName ?? t("recipient")) : pickup.restaurantName}</bdi>
      </p>
      {active && (
        <>
          {dropoff.landmark && (
            <p className="courier-landmark">
              <bdi>{dropoff.landmark}</bdi>
            </p>
          )}
          {dropoff.instructions && (
            <p className="courier-instructions">
              <bdi>{dropoff.instructions}</bdi>
            </p>
          )}
          <dl className="courier-address-fields">
            {fields.map(
              ([label, value]) =>
                value && (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      <bdi>{value}</bdi>
                    </dd>
                  </div>
                ),
            )}
          </dl>
          {customerPhone && (
            <a className="courier-call" href={"tel:" + customerPhone} onClick={onCall}>
              {t("call")}
            </a>
          )}
        </>
      )}
      <AlgeriaMap locale={locale} selected={active ? dropoff.pin : pickup.pin} />
      <CourierNavigation pin={active ? dropoff.pin : pickup.pin} />
    </section>
  );
}

function CourierCash({ job, locale }: { job: Job; locale: Locale }) {
  const t = useTranslations("courier");
  return (
    <section className="courier-panel courier-cash" aria-labelledby="courier-cash-title">
      <h3 id="courier-cash-title">
        <Icon name="receipt" />
        {t("cash")}
      </h3>
      <dl>
        <div>
          <dt>{t("amount")}</dt>
          <dd>
            <bdi>{formatDzd(job.order.totalDzd, locale)}</bdi>
          </dd>
        </div>
        <div>
          <dt>{t("change")}</dt>
          <dd>
            <bdi>{formatDzd(job.changeDzd, locale)}</bdi>
          </dd>
        </div>
      </dl>
    </section>
  );
}

function PickupAction({
  job,
  disabled,
  rtl,
  refresh,
}: {
  job: Job;
  disabled: boolean;
  rtl: boolean;
  refresh: () => void;
}) {
  const t = useTranslations("courier");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "retry" | "error">("idle");
  const key = useRef<string | undefined>(undefined);
  const running = useRef(false);

  async function pickup() {
    if (disabled || running.current) return;
    running.current = true;
    setState("saving");
    key.current ??= crypto.randomUUID();
    const result = await confirmCourierPickup(job, key.current);
    running.current = false;
    if (result.kind === "ready") {
      setState("saved");
      refresh();
      return;
    }
    if (result.kind !== "retry") key.current = undefined;
    setState(result.kind === "retry" ? "retry" : "error");
    if (result.kind === "conflict") refresh();
  }

  return (
    <div className="courier-actions">
      {state === "error" && (
        <p role="alert" className="courier-error">
          {t("error")}
        </p>
      )}
      {state === "retry" ? (
        <Button variant="primary" isBlock disabled={disabled} onClick={() => void pickup()}>
          {t("retryPickup")}
        </Button>
      ) : (
        <SlideConfirm
          rtl={rtl}
          disabled={disabled || state === "saving" || state === "saved"}
          label={t(state === "saving" ? "saving" : "confirmPickup")}
          hint={t(state === "saving" ? "saving" : "slidePickup")}
          onConfirm={() => void pickup()}
        />
      )}
    </div>
  );
}

export function CourierJob({
  job,
  locale,
  offline,
  refresh,
}: {
  job: Job;
  locale: Locale;
  offline: boolean;
  refresh: () => void;
}) {
  const t = useTranslations("courier");
  const { order } = job;
  const attempts = useDeliveryAttempt(job, offline);
  const active = order.status === "out_for_delivery";
  const ready = order.status === "ready";
  const label = active ? "onTheWay" : ready ? "ready" : "preparing";
  return (
    <section className="courier-work" data-active={active} aria-labelledby="courier-job-title">
      <div className="courier-job-heading">
        <h2 id="courier-job-title">
          <bdi>{order.shortCode}</bdi>
        </h2>
        <Badge tone={active || ready ? "success" : "warning"}>{t(label)}</Badge>
      </div>
      <DeliverySteps active={active} />
      <div className="courier-job-grid">
        <JobAddress
          job={job}
          locale={locale}
          active={active}
          onCall={() => void attempts.record("call")}
        />
        <CourierCash job={job} locale={locale} />
      </div>
      {ready && (
        <PickupAction
          job={job}
          disabled={offline}
          rtl={localeDetails[locale].direction === "rtl"}
          refresh={refresh}
        />
      )}
      {active && (
        <CourierDropoff
          job={job}
          locale={locale}
          offline={offline}
          refresh={refresh}
          attempts={attempts}
        />
      )}
      {!ready && !active && (
        <p className="courier-waiting" role="status">
          {t("waitForRestaurant")}
        </p>
      )}
    </section>
  );
}
