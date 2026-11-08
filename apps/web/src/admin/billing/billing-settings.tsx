"use client";

import { useTranslations } from "next-intl";
import type { SettingsDraft, SettingsSave } from "./billing-settings-http";
import { useBillingSettings, type BillingSettingsState } from "./use-billing-settings";

type TextField = Exclude<keyof SettingsDraft, "isOnlinePaymentEnabled">;
const numberFields = ["priceDzd", "trialDays", "dueDays", "graceDays", "taxRatePercent"] as const;
const numberFieldSet: ReadonlySet<string> = new Set(numberFields);
const legalFields = ["companyName", "companyAddress", "registrationNumber", "taxId"] as const;

function outcomeKey(outcome: SettingsSave) {
  if (outcome.kind === "invalid") return "invalid";
  if (outcome.kind === "session-changed") return "sessionChanged";
  if (outcome.kind === "sign-in") return "signInRequired";
  return outcome.kind === "saved" ? "saved" : "saveError";
}

function Field(props: { field: TextField; state: BillingSettingsState; draft: SettingsDraft }) {
  const translate = useTranslations("adminBillingSettings");
  const { field, state, draft } = props;
  const isNumber = numberFieldSet.has(field);
  const isInvalid = state.outcome?.kind === "invalid" && state.outcome.field === fieldKey(field);
  return (
    <label className="admin-merchant-field">
      <span>{translate(field)}</span>
      <input
        name={field}
        value={draft[field]}
        inputMode={isNumber ? "decimal" : undefined}
        dir={isNumber ? "ltr" : undefined}
        aria-invalid={isInvalid || undefined}
        disabled={state.isSaving}
        onChange={(event) => {
          state.change(field, event.currentTarget.value);
        }}
      />
    </label>
  );
}

/** Maps a form field to the contract field zod reports on. */
function fieldKey(field: TextField): string {
  return field === "taxRatePercent" ? "taxRateBasisPoints" : field;
}

function SettingsForm({ state, draft }: { state: BillingSettingsState; draft: SettingsDraft }) {
  const translate = useTranslations("adminBillingSettings");
  const { outcome } = state;
  return (
    <form
      className="admin-merchant-form"
      aria-busy={state.isSaving}
      onSubmit={(event) => {
        event.preventDefault();
        void state.save();
      }}
    >
      <fieldset>
        <legend>{translate("pricing")}</legend>
        {numberFields.map((field) => (
          <Field key={field} field={field} state={state} draft={draft} />
        ))}
      </fieldset>
      <fieldset>
        <legend>{translate("legal")}</legend>
        {legalFields.map((field) => (
          <Field key={field} field={field} state={state} draft={draft} />
        ))}
      </fieldset>
      <label>
        <input
          type="checkbox"
          checked={draft.isOnlinePaymentEnabled}
          disabled={state.isSaving}
          onChange={(event) => {
            state.change("isOnlinePaymentEnabled", event.currentTarget.checked);
          }}
        />{" "}
        {translate("onlinePayment")}
      </label>
      <Field field="reason" state={state} draft={draft} />
      <button className="admin-merchant-button" type="submit" disabled={state.isSaving}>
        {translate(state.isSaving ? "saving" : "save")}
      </button>
      {outcome !== undefined && (
        <p
          className={outcome.kind === "saved" ? "admin-merchant-success" : "admin-merchant-error"}
          role={outcome.kind === "saved" ? "status" : "alert"}
        >
          {translate(outcomeKey(outcome))}
        </p>
      )}
    </form>
  );
}

/** BIL-01 / ADM-08: subscription price, trial, due and grace days, tax and legal details. */
export function BillingSettings() {
  const translate = useTranslations("adminBillingSettings");
  const state = useBillingSettings();
  const { view, draft } = state;
  return (
    <section className="admin-merchant" aria-labelledby="billing-settings-title">
      <header className="admin-merchant-heading">
        <h1 id="billing-settings-title">{translate("title")}</h1>
        <p>{translate("intro")}</p>
      </header>
      {view.kind === "loading" && <p role="status">{translate("loading")}</p>}
      {view.kind === "sign-in" && <p role="alert">{translate("signInRequired")}</p>}
      {view.kind === "error" && (
        <div className="admin-merchant-notice">
          <p role="alert">{translate("loadError")}</p>
          <button className="admin-merchant-button" type="button" onClick={state.refresh}>
            {translate("retry")}
          </button>
        </div>
      )}
      {view.kind === "ready" && draft !== undefined && <SettingsForm state={state} draft={draft} />}
    </section>
  );
}
