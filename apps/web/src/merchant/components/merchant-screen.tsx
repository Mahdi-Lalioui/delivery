"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { MerchantApplicationForm } from "./merchant-form";
import { listMerchantMemberships, type Membership } from "../merchant-http";
import { useMerchantResource } from "../use-merchant-resource";

export type MerchantScreenKind = "application" | "status";

const statusLabels = {
  pending_review: "statusPending",
  approved: "statusApproved",
  rejected: "statusRejected",
  active: "statusActive",
  paused: "statusPaused",
  suspended: "statusSuspended",
} as const;

const roleLabels = { owner: "roleOwner", manager: "roleManager", staff: "roleStaff" } as const;

function MembershipList({
  locale,
  memberships,
}: {
  locale: Locale;
  memberships: readonly Membership[];
}) {
  const translate = useTranslations("merchant");

  return (
    <>
      {memberships.length === 0 ? (
        <p>{translate("noMemberships")}</p>
      ) : (
        <ul className="merchant-memberships" role="list">
          {memberships.map(({ merchantId, restaurantName, role, status }) => (
            <li key={merchantId} className="merchant-card merchant-membership">
              <h2>
                <bdi>{restaurantName}</bdi>
              </h2>
              <div className="merchant-badges">
                <span>{translate(roleLabels[role])}</span>
                <span className="merchant-status">{translate(statusLabels[status])}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <a className="merchant-primary" href={`/${locale}/merchant/apply`}>
        {translate("startApplication")}
      </a>
    </>
  );
}

function MerchantContent({ locale, screen }: { locale: Locale; screen: MerchantScreenKind }) {
  const translate = useTranslations("merchant");
  const { view, retry } = useMerchantResource(listMerchantMemberships);

  switch (view.kind) {
    case "loading":
      return <p role="status">{translate("loading")}</p>;
    case "unauthenticated":
      return (
        <div className="merchant-card">
          <p>{translate("signInRequired")}</p>
          <a className="merchant-primary" href={`/${locale}/sign-in?continue=merchant-apply`}>
            {translate("signIn")}
          </a>
        </div>
      );
    case "forbidden":
      return (
        <p role="alert" className="merchant-error">
          {translate("forbidden")}
        </p>
      );
    case "error":
      return (
        <div className="merchant-card">
          <p role="alert" className="merchant-error">
            {translate("loadError")}
          </p>
          <button className="merchant-secondary" type="button" onClick={retry}>
            {translate("retry")}
          </button>
        </div>
      );
    case "ready":
      return screen === "application" ? (
        <MerchantApplicationForm
          key={view.data.sessionId}
          locale={locale}
          sessionId={view.data.sessionId}
          onRefreshAccount={retry}
        />
      ) : (
        <MembershipList locale={locale} memberships={view.data.memberships} />
      );
  }
}

export function MerchantScreen({ locale, screen }: { locale: Locale; screen: MerchantScreenKind }) {
  const translate = useTranslations("merchant");
  const isApplication = screen === "application";

  return (
    <section className="merchant-panel" aria-labelledby="merchant-title">
      <header className="merchant-heading">
        <h1 id="merchant-title">{translate(isApplication ? "applicationTitle" : "statusTitle")}</h1>
        <p>{translate(isApplication ? "applicationIntro" : "statusIntro")}</p>
      </header>
      <MerchantContent locale={locale} screen={screen} />
      {isApplication && (
        <a className="merchant-secondary" href={`/${locale}/merchant`}>
          {translate("viewStatus")}
        </a>
      )}
    </section>
  );
}
