"use client";

import {
  ActionBar,
  Button,
  Card,
  ErrorState,
  FormGrid,
  MoneyField,
  PageHeader,
  Skeleton,
  TextField,
  Toggle,
  useToast,
} from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useEffect, type ChangeEvent } from "react";
import type { SettingsDraft, SettingsSave } from "./billing-settings-http";
import { useBillingSettings, type BillingSettingsState } from "./use-billing-settings";

type TextKey = Exclude<keyof SettingsDraft, "isOnlinePaymentEnabled">;
type Field = { key: TextKey; kind: "money" | "days" | "percent" | "text" };

const pricing: readonly Field[] = [
  { key: "priceDzd", kind: "money" },
  { key: "taxRatePercent", kind: "percent" },
  { key: "trialDays", kind: "days" },
  { key: "dueDays", kind: "days" },
  { key: "graceDays", kind: "days" },
];
const legal: readonly Field[] = [
  { key: "companyName", kind: "text" },
  { key: "companyAddress", kind: "text" },
  { key: "registrationNumber", kind: "text" },
  { key: "taxId", kind: "text" },
];
const percentUnit = "%";

/** Maps a form field to the contract field zod reports on. */
function contractKey(key: TextKey): string {
  return key === "taxRatePercent" ? "taxRateBasisPoints" : key;
}

function SettingsInput(props: { field: Field; state: BillingSettingsState; draft: SettingsDraft }) {
  const translate = useTranslations("adminBillingSettings");
  const { field, state, draft } = props;
  const { key, kind } = field;
  const isInvalid = state.outcome?.kind === "invalid" && state.outcome.field === contractKey(key);
  const shared = {
    label: translate(key),
    name: key,
    value: draft[key],
    disabled: state.isSaving,
    error: isInvalid ? translate("invalid") : undefined,
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      state.change(key, event.currentTarget.value);
    },
  };
  if (kind === "money") return <MoneyField {...shared} unit={translate("unit")} />;
  if (kind === "text") return <TextField {...shared} />;
  const suffix = kind === "percent" ? percentUnit : translate("daysUnit");
  return <TextField {...shared} width="short" suffix={suffix} inputMode="decimal" dir="ltr" />;
}

const outcomeKeys = {
  saved: "saved",
  "session-changed": "sessionChanged",
  "sign-in": "signInRequired",
  error: "saveError",
} as const satisfies Readonly<Record<Exclude<SettingsSave["kind"], "invalid">, string>>;

function useOutcomeToast(state: BillingSettingsState) {
  const translate = useTranslations("adminBillingSettings");
  const toast = useToast();
  const { outcome, outcomeId } = state;
  useEffect(() => {
    if (outcome === undefined || outcome.kind === "invalid") return;
    toast.show(
      translate(outcomeKeys[outcome.kind]),
      outcome.kind === "saved" ? "success" : "danger",
    );
  }, [outcome, outcomeId, toast, translate]);
}

function SettingsForm({ state, draft }: { state: BillingSettingsState; draft: SettingsDraft }) {
  const translate = useTranslations("adminBillingSettings");
  return (
    <form
      className="billing-layout"
      aria-busy={state.isSaving}
      onSubmit={(event) => {
        event.preventDefault();
        void state.save();
      }}
    >
      <Card title={translate("pricing")} titleId="settings-pricing">
        <FormGrid>
          {pricing.map((field) => (
            <SettingsInput key={field.key} field={field} state={state} draft={draft} />
          ))}
        </FormGrid>
        <Toggle
          label={translate("onlinePayment")}
          description={translate("onlinePaymentHint")}
          checked={draft.isOnlinePaymentEnabled}
          disabled={state.isSaving}
          onChange={(checked) => {
            state.change("isOnlinePaymentEnabled", checked);
          }}
        />
      </Card>
      <Card title={translate("legal")} titleId="settings-legal">
        <FormGrid>
          {legal.map((field) => (
            <SettingsInput key={field.key} field={field} state={state} draft={draft} />
          ))}
        </FormGrid>
      </Card>
      <Card tone="sunken">
        <SettingsInput field={{ key: "reason", kind: "text" }} state={state} draft={draft} />
        <ActionBar>
          <Button type="submit" variant="primary" size="lg" isLoading={state.isSaving}>
            {translate(state.isSaving ? "saving" : "save")}
          </Button>
        </ActionBar>
      </Card>
    </form>
  );
}

/** BIL-01 / ADM-08 view (page and design gallery). */
export function BillingSettingsView({ state }: { state: BillingSettingsState }) {
  const translate = useTranslations("adminBillingSettings");
  useOutcomeToast(state);
  const { view, draft } = state;
  return (
    <section className="billing-page" aria-labelledby="billing-settings-title">
      <PageHeader
        title={translate("title")}
        intro={translate("intro")}
        titleId="billing-settings-title"
      />
      {view.kind === "loading" && <Skeleton label={translate("loading")} lines={8} />}
      {view.kind === "sign-in" && <ErrorState title={translate("signInRequired")} />}
      {view.kind === "error" && (
        <ErrorState
          title={translate("loadError")}
          retryLabel={translate("retry")}
          onRetry={state.refresh}
        />
      )}
      {view.kind === "ready" && draft !== undefined && <SettingsForm state={state} draft={draft} />}
    </section>
  );
}

/** BIL-01 / ADM-08: subscription price, trial, due and grace days, tax and legal details. */
export function BillingSettings() {
  return <BillingSettingsView state={useBillingSettings()} />;
}
