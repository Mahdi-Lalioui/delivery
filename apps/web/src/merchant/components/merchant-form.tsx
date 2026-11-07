"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
  ApplicationPinFields,
  ApplicationTextField,
  CommuneField,
  CuisineFields,
} from "./application-fields";
import { listAlgiersCommunes } from "../merchant-http";
import { useMerchantApplication, type MerchantApplicationState } from "../use-merchant-application";
import { useMerchantResource } from "../use-merchant-resource";

function ApplicationFeedback({
  error,
  hasInvalidFields,
}: {
  error: MerchantApplicationState["error"];
  hasInvalidFields: boolean;
}) {
  const translate = useTranslations("merchant");
  return (
    <>
      {hasInvalidFields && (
        <p role="alert" className="merchant-error">
          {translate("fixErrors")}
        </p>
      )}
      {error && error !== "invalidCommune" && (
        <p className="merchant-error" role="alert" id="merchant-application-error">
          {translate(error)}
        </p>
      )}
    </>
  );
}

export function MerchantApplicationForm({
  locale,
  sessionId,
  onRefreshAccount,
}: {
  locale: Locale;
  sessionId: string;
  onRefreshAccount: () => void;
}) {
  const translate = useTranslations("merchant");
  const state = useMerchantApplication(sessionId);
  const communeResource = useMerchantResource(listAlgiersCommunes);
  const [locating, setLocating] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const success = useRef<HTMLHeadingElement>(null);
  const refresh = useRef<HTMLButtonElement>(null);
  const canSubmit =
    communeResource.view.kind === "ready" && communeResource.view.data.length > 0 && !locating;

  useEffect(() => {
    if (state.submitted) success.current?.focus();
    if (state.sessionChanged) refresh.current?.focus();
  }, [state.submitted, state.sessionChanged]);

  if (state.sessionChanged) {
    return (
      <div className="merchant-card">
        <p className="merchant-error" role="alert">
          {translate("sessionChanged")}
        </p>
        <button
          type="button"
          className="merchant-secondary"
          ref={refresh}
          onClick={onRefreshAccount}
        >
          {translate("refreshAccount")}
        </button>
      </div>
    );
  }

  if (state.submitted) {
    return (
      <div className="merchant-card">
        <h2 tabIndex={-1} ref={success}>
          {translate("submittedTitle")}
        </h2>
        <p role="status">{translate("submittedDescription")}</p>
      </div>
    );
  }

  return (
    <form
      className="merchant-card merchant-form"
      ref={form}
      method="post"
      noValidate
      aria-busy={state.pending}
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        void state.submit().then((field) => {
          if (field) form.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
        });
      }}
    >
      <p className="merchant-hint">{translate("verifiedPhone")}</p>
      <fieldset className="merchant-form-fields" disabled={state.pending}>
        <div className="merchant-grid">
          <ApplicationTextField state={state} field="restaurantName" />
          <ApplicationTextField state={state} field="ownerName" />
        </div>
        <CommuneField state={state} locale={locale} resource={communeResource} />
        <ApplicationPinFields state={state} onLocatingChange={setLocating} />
        <CuisineFields state={state} />
        <ApplicationTextField state={state} field="rcNumber" />
      </fieldset>
      <ApplicationFeedback error={state.error} hasInvalidFields={state.fields.length > 0} />
      {state.error === "signInRequired" ? (
        <a className="merchant-primary" href={`/${locale}/sign-in?continue=merchant-apply`}>
          {translate("signIn")}
        </a>
      ) : (
        <button type="submit" className="merchant-primary" disabled={state.pending || !canSubmit}>
          {translate(state.pending ? "submitting" : "submit")}
        </button>
      )}
    </form>
  );
}
