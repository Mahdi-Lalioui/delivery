"use client";

import { formatAlgiersDate, formatAlgiersTime } from "@zaafran/i18n/formats";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { PendingApplicationsNotice } from "./pending-applications-notice";
import { AdminMerchantReview } from "./admin-merchant-review";
import { useAdminMerchantQueue, type AdminMerchantQueueState } from "./use-admin-merchant-queue";

type AdminLocale = "fr" | "en";

function QueueNotice({ state }: { state: AdminMerchantQueueState }) {
  const translate = useTranslations("adminMerchant");
  const message = useRef<HTMLParagraphElement>(null);
  const notice = state.view.kind === "session-changed" ? "sessionChanged" : state.notice;

  const canRefresh = notice === "stale" || notice === "sessionChanged";
  useEffect(() => {
    if (canRefresh) message.current?.focus();
  }, [canRefresh]);

  if (!notice) return null;
  if (notice === "approved" || notice === "rejected") {
    return (
      <p className="admin-merchant-success" role="status">
        {translate(notice)}
      </p>
    );
  }
  return (
    <div className="admin-merchant-notice">
      <p className="admin-merchant-error" ref={message} tabIndex={-1} role="alert">
        {translate(notice)}
      </p>
      {canRefresh && (
        <button className="admin-merchant-button" type="button" onClick={state.refresh}>
          {translate("refresh")}
        </button>
      )}
    </div>
  );
}

function PendingTable({ state, locale }: { state: AdminMerchantQueueState; locale: AdminLocale }) {
  const translate = useTranslations("adminMerchant");
  if (state.view.kind !== "ready") return null;
  const { applications, nextCursor } = state.view;

  return (
    <div className="admin-merchant-list">
      {applications.length === 0 && nextCursor === null && <p>{translate("empty")}</p>}
      {applications.length > 0 && (
        <table aria-label={translate("title")} className="admin-merchant-table">
          <thead>
            <tr>
              <th scope="col">{translate("restaurant")}</th>
              <th scope="col">{translate("submitted")}</th>
            </tr>
          </thead>
          <tbody>
            {applications.map(({ merchantId, restaurantName, submittedAt }) => {
              const instant = Date.parse(submittedAt);
              return (
                <tr key={merchantId}>
                  <th scope="row">
                    <button
                      type="button"
                      className="admin-merchant-row-action"
                      disabled={state.isSaving}
                      aria-pressed={state.application?.merchantId === merchantId}
                      onClick={() => {
                        state.select(merchantId);
                      }}
                    >
                      <bdi>{restaurantName}</bdi>
                    </button>
                  </th>
                  <td>
                    <time dateTime={submittedAt} className="admin-merchant-date">
                      <span>{formatAlgiersDate(instant, locale)}</span>
                      <span>{formatAlgiersTime(instant, locale)}</span>
                    </time>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {nextCursor !== null && (
        <button
          className="admin-merchant-button"
          type="button"
          disabled={state.isPaging || state.isSaving}
          onClick={state.loadMore}
        >
          {translate(state.isPaging ? "loading" : "loadMore")}
        </button>
      )}
    </div>
  );
}

function QueueContent({ state, locale }: { state: AdminMerchantQueueState; locale: AdminLocale }) {
  const translate = useTranslations("adminMerchant");

  switch (state.view.kind) {
    case "session-changed":
      return null;
    case "loading":
      return <p role="status">{translate("loading")}</p>;
    case "sign-in":
      return (
        <div className="admin-merchant-notice">
          <p role="alert">{translate("signInRequired")}</p>
          <a className="admin-merchant-button" href={`/${locale}/sign-in?continue=admin-review`}>
            {translate("signIn")}
          </a>
        </div>
      );
    case "error":
      return (
        <div className="admin-merchant-notice">
          <p className="admin-merchant-error" role="alert">
            {translate("loadError")}
          </p>
          <button className="admin-merchant-button" type="button" onClick={state.refresh}>
            {translate("retry")}
          </button>
        </div>
      );
    case "ready":
      return (
        <div className="admin-merchant-workspace">
          <PendingTable state={state} locale={locale} />
          {state.application ? (
            <AdminMerchantReview
              key={state.application.merchantId}
              application={state.application}
              locale={locale}
              state={state}
            />
          ) : state.view.applications.length > 0 ? (
            <p className="admin-merchant-placeholder">{translate("selectApplication")}</p>
          ) : null}
        </div>
      );
  }
}

export function AdminMerchantQueue({ locale }: { locale: AdminLocale }) {
  const translate = useTranslations("adminMerchant");
  const state = useAdminMerchantQueue();
  const heading = useRef<HTMLHeadingElement>(null);
  const { notice } = state;

  useEffect(() => {
    if (notice === "approved" || notice === "rejected") heading.current?.focus();
  }, [notice]);

  return (
    <section className="admin-merchant" aria-labelledby="admin-merchant-title">
      <header className="admin-merchant-heading">
        <h1 ref={heading} id="admin-merchant-title" tabIndex={-1}>
          {translate("title")}
        </h1>
        <p>{translate("intro")}</p>
      </header>
      <PendingApplicationsNotice state={state} />
      <QueueNotice state={state} />
      <QueueContent state={state} locale={locale} />
    </section>
  );
}
