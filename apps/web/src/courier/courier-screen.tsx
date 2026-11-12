"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { Button, ButtonLink, EmptyState, ErrorState, Icon, Skeleton, Toggle } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { setCourierOnline, type Jobs } from "./courier-http";
import { CourierInvite, useCourierInvite } from "./courier-invite";
import { CourierJob } from "./courier-job";
import { useCourierJobs } from "./use-courier-jobs";

type Ready = { data: Jobs; offline: boolean; locale: Locale; refresh: () => void };

function Presence({
  online,
  disabled,
  refresh,
}: {
  online: boolean;
  disabled: boolean;
  refresh: () => void;
}) {
  const t = useTranslations("courier");
  const [pending, setPending] = useState<boolean | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  async function change(next: boolean) {
    setFailed(false);
    setPending(next);
    const result = await setCourierOnline(next);
    setPending(undefined);
    setFailed(result.kind !== "ready");
    refresh();
  }
  return (
    <div className="courier-presence">
      <Toggle
        label={t("available")}
        description={t((pending ?? online) ? "online" : "offline")}
        checked={pending ?? online}
        disabled={disabled || pending !== undefined}
        onChange={(next) => void change(next)}
      />
      {failed && (
        <p className="courier-error" role="alert">
          {t("error")}
        </p>
      )}
    </div>
  );
}

function ReadyJobs({ data, offline, locale, refresh }: Ready) {
  const t = useTranslations("courier");
  const [selected, select] = useState("");
  const job = data.jobs.find(({ order }) => order.orderId === selected) ?? data.jobs[0];
  return (
    <>
      <Presence online={data.online} disabled={offline} refresh={refresh} />
      {offline && (
        <p className="courier-offline" role="status">
          <Icon name="alert" />
          {t("connectionLost")}
        </p>
      )}
      {data.jobs.length > 1 && (
        <nav className="courier-job-list" aria-label={t("jobs")}>
          {data.jobs.map(({ order }) => (
            <Button
              key={order.orderId}
              aria-pressed={order.orderId === job?.order.orderId}
              variant={order.orderId === job?.order.orderId ? "primary" : "secondary"}
              onClick={() => {
                select(order.orderId);
              }}
            >
              <bdi>{order.shortCode}</bdi>
            </Button>
          ))}
        </nav>
      )}
      {job ? (
        <CourierJob
          key={job.order.orderId + ":" + String(job.order.version)}
          job={job}
          locale={locale}
          offline={offline}
          refresh={refresh}
        />
      ) : (
        <div className="courier-panel">
          <EmptyState icon="bike" title={t("noJobs")} body={t("noJobsBody")} />
        </div>
      )}
    </>
  );
}

function CourierJobs({ locale }: { locale: Locale }) {
  const t = useTranslations("courier");
  const { view, refresh } = useCourierJobs();
  switch (view.kind) {
    case "loading":
      return (
        <div className="courier-panel">
          <Skeleton label={t("loading")} lines={5} />
        </div>
      );
    case "sign-in":
      return (
        <div className="courier-panel">
          <EmptyState
            icon="bike"
            title={t("signInTitle")}
            action={
              <ButtonLink variant="primary" href={`/${locale}/sign-in?continue=courier`}>
                {t("signIn")}
              </ButtonLink>
            }
          />
        </div>
      );
    case "forbidden":
      return (
        <div className="courier-panel">
          <EmptyState icon="flag" title={t("noAccess")} body={t("noAccessBody")} />
        </div>
      );
    case "error":
      return (
        <div className="courier-panel">
          <ErrorState title={t("error")} retryLabel={t("retry")} onRetry={refresh} />
        </div>
      );
    case "ready":
      return (
        <ReadyJobs data={view.data} offline={view.offline} locale={locale} refresh={refresh} />
      );
  }
}

export function CourierScreen({ locale }: { locale: Locale }) {
  const t = useTranslations("courier");
  const { invite, dismiss } = useCourierInvite();
  return (
    <div className="courier-screen">
      <header className="courier-heading">
        <span className="courier-brand-icon">
          <Icon name="bike" size={30} />
        </span>
        <div>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
      </header>
      {invite === undefined ? (
        <div className="courier-panel">
          <Skeleton label={t("loading")} />
        </div>
      ) : invite ? (
        <CourierInvite inviteId={invite} locale={locale} onAccepted={dismiss} />
      ) : (
        <CourierJobs locale={locale} />
      )}
    </div>
  );
}
