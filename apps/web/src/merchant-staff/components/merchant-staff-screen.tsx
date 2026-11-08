"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import type { StaffNotice, StaffState } from "../staff-flow";
import { useMerchantStaff, type MerchantStaffControls } from "../use-merchant-staff";
import { StaffInviteForm } from "./staff-invite-form";
import { StaffLists } from "./staff-lists";

const noticeKeys = {
  invited: "invited",
  revoked: "revoked",
  stale: "stale",
  "already-member": "alreadyMember",
  "already-invited": "alreadyInvited",
  "delivery-unavailable": "deliveryUnavailable",
  "invite-error": "inviteError",
  "revoke-error": "revokeError",
} as const satisfies Record<StaffNotice, string>;

function StaffNoticeText({ notice, reload }: { notice: StaffNotice; reload: () => void }) {
  const translate = useTranslations("merchantStaff");
  const message = useRef<HTMLParagraphElement>(null);
  const isSuccess = notice === "invited" || notice === "revoked";

  useEffect(() => {
    message.current?.focus();
  }, [notice]);

  return (
    <div className="hours-pause-actions">
      <p
        ref={message}
        tabIndex={-1}
        className={isSuccess ? "hours-announcement" : "hours-error"}
        role={isSuccess ? "status" : "alert"}
      >
        {translate(noticeKeys[notice])}
      </p>
      {notice === "stale" && (
        <button className="menu-item-secondary" type="button" onClick={reload}>
          {translate("reload")}
        </button>
      )}
    </div>
  );
}

type Gate = Exclude<StaffState["kind"], "ready">;

function StaffGate({ kind, locale, reload }: { kind: Gate; locale: Locale; reload: () => void }) {
  const translate = useTranslations("merchantStaff");
  switch (kind) {
    case "loading":
      return <p role="status">{translate("loading")}</p>;
    case "sign-in":
      return (
        <div className="hours-card">
          <p>{translate("signInRequired")}</p>
          <a className="menu-item-primary" href={`/${locale}/sign-in?continue=merchant-status`}>
            {translate("signIn")}
          </a>
        </div>
      );
    case "not-found":
      return (
        <p className="hours-error" role="alert">
          {translate("notFound")}
        </p>
      );
    case "error":
    case "session-changed":
      return (
        <div className="hours-card">
          <p className="hours-error" role="alert">
            {translate(kind === "error" ? "loadError" : "sessionChanged")}
          </p>
          <button className="menu-item-secondary" type="button" onClick={reload}>
            {translate(kind === "error" ? "retry" : "reload")}
          </button>
        </div>
      );
  }
}

function StaffWorkspace({ controls }: { controls: MerchantStaffControls }) {
  const { state } = controls;
  if (state.kind !== "ready") return null;
  return (
    <>
      {state.notice && <StaffNoticeText notice={state.notice} reload={controls.reload} />}
      <div className="hours-workspace">
        <StaffInviteForm controls={controls} />
        <StaffLists state={state} controls={controls} />
      </div>
    </>
  );
}

/** MER-23: the owner's team page: members, open invitations and the invite form. */
export function MerchantStaffScreen({
  merchantId,
  locale,
}: {
  merchantId: string;
  locale: Locale;
}) {
  const translate = useTranslations("merchantStaff");
  const controls = useMerchantStaff(merchantId);
  const { state } = controls;

  return (
    <section className="hours-panel" aria-labelledby="staff-title">
      <header className="hours-heading">
        <a className="menu-item-secondary" href={`/${locale}/merchant`}>
          {translate("backToRestaurants")}
        </a>
        <h1 id="staff-title">{translate("title")}</h1>
        <p>{translate("intro")}</p>
      </header>
      {state.kind === "ready" ? (
        <StaffWorkspace controls={controls} />
      ) : (
        <StaffGate kind={state.kind} locale={locale} reload={controls.reload} />
      )}
    </section>
  );
}
