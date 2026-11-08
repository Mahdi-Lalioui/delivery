"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useStaffAccept, type StaffAcceptView } from "../use-staff-accept";

const roleKeys = { manager: "roleManager", staff: "roleStaff" } as const;
const refusalKeys = {
  missing: "acceptMissing",
  "not-found": "acceptNotFound",
  "already-member": "alreadyMember",
} as const;

function RestaurantsLink({ locale }: { locale: Locale }) {
  const translate = useTranslations("merchantStaff");
  return (
    <a className="menu-item-primary" href={`/${locale}/merchant`}>
      {translate("openRestaurants")}
    </a>
  );
}

function AcceptOutcome({ view, locale, retry }: Props & { view: StaffAcceptView }) {
  const translate = useTranslations("merchantStaff");
  switch (view.kind) {
    case "accepting":
      return <p role="status">{translate("accepting")}</p>;
    case "accepted":
      return (
        <>
          <p className="hours-announcement" role="status">
            {translate.rich("accepted", {
              name: view.restaurantName,
              role: translate(roleKeys[view.role]),
              restaurant: (chunks) => <bdi>{chunks}</bdi>,
            })}
          </p>
          <RestaurantsLink locale={locale} />
        </>
      );
    case "sign-in":
      return (
        <>
          <p role="alert">{translate("acceptSignIn")}</p>
          <a className="menu-item-primary" href={`/${locale}/sign-in?continue=staff-accept`}>
            {translate("signIn")}
          </a>
        </>
      );
    case "error":
      return (
        <>
          <p className="hours-error" role="alert">
            {translate("acceptError")}
          </p>
          <button className="menu-item-secondary" type="button" onClick={retry}>
            {translate("retry")}
          </button>
        </>
      );
    case "missing":
    case "not-found":
    case "already-member":
      return (
        <>
          <p className="hours-error" role="alert">
            {translate(refusalKeys[view.kind])}
          </p>
          <RestaurantsLink locale={locale} />
        </>
      );
  }
}

type Props = { locale: Locale; retry: () => void };

/** MER-23: the invitee's landing page for the SMS invitation link. */
export function StaffAcceptScreen({ locale }: { locale: Locale }) {
  const translate = useTranslations("merchantStaff");
  const { view, retry } = useStaffAccept();
  return (
    <section className="hours-panel" aria-labelledby="staff-accept-title">
      <header className="hours-heading">
        <h1 id="staff-accept-title">{translate("acceptTitle")}</h1>
      </header>
      <div className="hours-card">
        <AcceptOutcome view={view} locale={locale} retry={retry} />
      </div>
    </section>
  );
}
