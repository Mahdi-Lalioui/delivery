"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import { useMerchantResource } from "../../merchant/use-merchant-resource";
import { loadMerchantOnboarding, type MerchantOnboarding } from "../merchant-onboarding-http";

type StepStatus = "complete" | "incomplete" | "unavailable";
type StepKey = "profile" | "hours" | "deliveryZone" | "testOrder";

function SetupBadge({ status }: { status: StepStatus }) {
  const translate = useTranslations("merchantOnboarding");
  return (
    <span className="setup-badge" data-status={status}>
      {translate(status)}
    </span>
  );
}

function SetupStep({ step, status }: { step: StepKey; status: StepStatus }) {
  const translate = useTranslations("merchantOnboarding");

  return (
    <li className="setup-step">
      <div className="setup-step-heading">
        <h3>{translate(step)}</h3>
        <SetupBadge status={status} />
      </div>
    </li>
  );
}

function MenuStep({
  progress,
  locale,
  merchantId,
}: {
  progress: MerchantOnboarding["steps"]["menu"];
  locale: Locale;
  merchantId: string;
}) {
  const translate = useTranslations("merchantOnboarding");
  const { itemsTowardMinimum, requiredItems } = progress;

  return (
    <li className="setup-step setup-menu">
      <div className="setup-step-heading">
        <h3 id="setup-menu-title">{translate("menu")}</h3>
        <SetupBadge status={itemsTowardMinimum === requiredItems ? "complete" : "incomplete"} />
      </div>
      <p id="setup-menu-count">
        {translate("menuProgress", {
          completed: String(itemsTowardMinimum),
          required: String(requiredItems),
        })}
      </p>
      <progress
        value={itemsTowardMinimum}
        max={requiredItems}
        aria-labelledby="setup-menu-title"
        aria-describedby="setup-menu-count"
      />
      <a className="setup-primary" href={`/${locale}/merchant/${merchantId}/menu`}>
        {translate("editMenu")}
      </a>
    </li>
  );
}

function SetupChecklist({ data, locale }: { data: MerchantOnboarding; locale: Locale }) {
  const translate = useTranslations("merchantOnboarding");
  const { steps, merchantId, restaurantName } = data;

  return (
    <>
      <div className="setup-card">
        <p className="setup-restaurant">
          <bdi>{restaurantName}</bdi>
        </p>
        <h2 id="setup-checklist-title">{translate("checklist")}</h2>
        <ul className="setup-list" role="list" aria-labelledby="setup-checklist-title">
          <SetupStep step="profile" status={steps.profile} />
          <SetupStep step="hours" status={steps.hours} />
          <MenuStep progress={steps.menu} locale={locale} merchantId={merchantId} />
          <SetupStep step="deliveryZone" status={steps.deliveryZone} />
          <SetupStep step="testOrder" status={steps.testOrder} />
        </ul>
      </div>
      <section className="setup-card" aria-labelledby="setup-live-title">
        <div className="setup-step-heading">
          <h2 id="setup-live-title">{translate("goLive")}</h2>
          <SetupBadge status="unavailable" />
        </div>
        <p>{translate("goLiveDescription")}</p>
      </section>
    </>
  );
}

type OnboardingView = ReturnType<typeof useMerchantResource<MerchantOnboarding>>["view"];

function SetupContent({
  view,
  locale,
  retry,
}: {
  view: OnboardingView;
  locale: Locale;
  retry: () => void;
}) {
  const translate = useTranslations("merchantOnboarding");

  switch (view.kind) {
    case "loading":
      return <p role="status">{translate("loading")}</p>;
    case "unauthenticated":
      return (
        <div className="setup-card">
          <p>{translate("signInRequired")}</p>
          <a className="setup-primary" href={`/${locale}/sign-in?continue=merchant-status`}>
            {translate("signIn")}
          </a>
        </div>
      );
    case "forbidden":
      return (
        <p className="setup-error" role="alert">
          {translate("forbidden")}
        </p>
      );
    case "error":
      return (
        <div className="setup-card">
          <p className="setup-error" role="alert">
            {translate("loadError")}
          </p>
          <button type="button" className="setup-secondary" onClick={retry}>
            {translate("retry")}
          </button>
        </div>
      );
    case "ready":
      return <SetupChecklist data={view.data} locale={locale} />;
  }
}

export function MerchantOnboardingScreen({
  merchantId,
  locale,
}: {
  merchantId: string;
  locale: Locale;
}) {
  const translate = useTranslations("merchantOnboarding");
  const read = useCallback(
    (signal: AbortSignal) => loadMerchantOnboarding({ merchantId, signal }),
    [merchantId],
  );
  const { view, retry } = useMerchantResource(read);
  const title = useRef<HTMLHeadingElement>(null);

  function retryRead() {
    retry();
    title.current?.focus();
  }

  return (
    <section className="setup-panel" aria-labelledby="setup-title">
      <header className="setup-heading">
        <a className="setup-secondary" href={`/${locale}/merchant`}>
          {translate("backToRestaurants")}
        </a>
        <h1 id="setup-title" tabIndex={-1} ref={title}>
          {translate("title")}
        </h1>
        <p>{translate("description")}</p>
      </header>
      <SetupContent view={view} locale={locale} retry={retryRead} />
    </section>
  );
}
