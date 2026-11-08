"use client";

import type { Locale } from "@zaafran/i18n/locales";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  KpiTile,
  PageHeader,
  SegmentedControl,
  SelectField,
  Skeleton,
  TextField,
  useToast,
  type IconName,
} from "@zaafran/ui";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { InvoiceBadge, Money, Period, SubscriptionBadge } from "./billing-display";
import {
  billingBanner,
  invoicePdfUrl,
  type BillingBanner,
  type MerchantInvoice,
  type MerchantSubscription,
  type TransferMethod,
  type TransferResult,
} from "./merchant-billing-http";
import { useMerchantBilling, type MerchantBillingState } from "./use-merchant-billing";

type Ready = Extract<MerchantBillingState["view"], { kind: "ready" }>;
type BannerStyle = { key: string; tone: "info" | "warning" | "danger"; icon: IconName };
const banners = {
  trial: { key: "bannerTrial", tone: "info", icon: "calendar" },
  due: { key: "bannerDue", tone: "warning", icon: "receipt" },
  past_due: { key: "bannerPastDue", tone: "warning", icon: "clock" },
  suspended: { key: "bannerSuspended", tone: "danger", icon: "alert" },
} as const satisfies Readonly<Record<BillingBanner, BannerStyle>>;

function Banner({ banner, canPay }: { banner: BillingBanner; canPay: boolean }) {
  const translate = useTranslations("merchantBilling");
  const { key, tone, icon } = banners[banner];
  return (
    <div className="billing-banner" data-tone={tone} role={tone === "info" ? "status" : "alert"}>
      <Icon name={icon} />
      <p className="billing-banner-text">{translate(key)}</p>
      {canPay && (
        <a className="ui-button ui-button-primary ui-button-sm" href="#merchant-billing-pay">
          {translate("payNow")}
        </a>
      )}
    </div>
  );
}

function Plan(props: { subscription: MerchantSubscription | null; locale: Locale }) {
  const translate = useTranslations("merchantBilling");
  const format = useFormatter();
  const { subscription, locale } = props;
  if (subscription === null) return <EmptyState icon="calendar" title={translate("noPlan")} />;
  const date = (value: string) =>
    format.dateTime(new Date(value), { day: "numeric", month: "long", timeZone: "Africa/Algiers" });
  const isTrial = subscription.status === "trialing" && subscription.trialEndsAt !== null;
  return (
    <div className="billing-plan">
      <KpiTile
        label={translate("status")}
        value={<SubscriptionBadge status={subscription.status} namespace="merchantBilling" />}
      />
      <KpiTile
        label={translate("price")}
        value={<Money amountDzd={subscription.priceDzd} locale={locale} />}
      />
      {isTrial && subscription.trialEndsAt !== null && (
        <KpiTile label={translate("trialEnds")} value={date(subscription.trialEndsAt)} />
      )}
      {subscription.nextInvoiceAt !== null && (
        <KpiTile label={translate("nextInvoice")} value={date(subscription.nextInvoiceAt)} />
      )}
    </div>
  );
}

function InvoiceItem(props: { merchantId: string; invoice: MerchantInvoice; locale: Locale }) {
  const translate = useTranslations("merchantBilling");
  const { merchantId, invoice, locale } = props;
  return (
    <li className="billing-row">
      <span className="billing-row-icon" aria-hidden="true">
        <Icon name="receipt" />
      </span>
      <div className="billing-row-main">
        <p className="billing-row-title">
          <bdi>{invoice.number}</bdi>
          <Money amountDzd={invoice.totalDzd} locale={locale} />
        </p>
        <p className="billing-row-meta">
          <Period startsAt={invoice.period.startsAt} endsAt={invoice.period.endsAt} />
          <InvoiceBadge status={invoice.status} namespace="merchantBilling" />
        </p>
      </div>
      {invoice.pdfAvailable && (
        <a
          className="ui-icon-button"
          href={invoicePdfUrl(merchantId, invoice.invoiceId)}
          download
          aria-label={translate("downloadInvoice", { number: invoice.number })}
        >
          <Icon name="download" />
        </a>
      )}
    </li>
  );
}

function InvoiceList(props: { merchantId: string; invoices: MerchantInvoice[]; locale: Locale }) {
  const translate = useTranslations("merchantBilling");
  if (props.invoices.length === 0) {
    return (
      <EmptyState
        icon="receipt"
        title={translate("noInvoices")}
        body={translate("noInvoicesBody")}
      />
    );
  }
  return (
    <ul className="billing-rows">
      {props.invoices.map((invoice) => (
        <InvoiceItem
          key={invoice.invoiceId}
          merchantId={props.merchantId}
          invoice={invoice}
          locale={props.locale}
        />
      ))}
    </ul>
  );
}

function ProofPicker({ isDisabled, isInvalid }: { isDisabled: boolean; isInvalid: boolean }) {
  const translate = useTranslations("merchantBilling");
  const [fileName, setFileName] = useState<string>();
  return (
    <label
      className="billing-dropzone"
      data-invalid={isInvalid || undefined}
      data-filled={fileName !== undefined || undefined}
    >
      <Icon name={fileName === undefined ? "plus" : "check"} size={24} />
      <span className="billing-dropzone-title">{fileName ?? translate("proof")}</span>
      <span className="billing-dropzone-hint">{translate("proofHint")}</span>
      <input
        className="ui-visually-hidden"
        name="proof"
        type="file"
        required
        accept="image/jpeg,image/png,image/heic,image/webp"
        disabled={isDisabled}
        onChange={(event) => {
          setFileName(event.currentTarget.files?.[0]?.name);
        }}
      />
    </label>
  );
}

function readDraft(form: HTMLFormElement) {
  const data = new FormData(form);
  const text = (name: string) => {
    const value = data.get(name);
    return typeof value === "string" ? value : "";
  };
  const file = data.get("proof");
  const method: TransferMethod = text("method") === "baridimob" ? "baridimob" : "ccp";
  return {
    invoiceId: text("invoiceId"),
    method,
    reference: text("reference"),
    file: file instanceof File && file.size > 0 ? file : undefined,
  };
}

function InvoiceChoice(props: { payable: MerchantInvoice[]; isDisabled: boolean; locale: Locale }) {
  const translate = useTranslations("merchantBilling");
  const [only, ...others] = props.payable;
  if (only !== undefined && others.length === 0) {
    return (
      <>
        <input type="hidden" name="invoiceId" value={only.invoiceId} />
        <p className="billing-row-title">
          <bdi>{only.number}</bdi>
          <Money amountDzd={only.totalDzd} locale={props.locale} />
        </p>
      </>
    );
  }
  return (
    <SelectField label={translate("invoice")} name="invoiceId" disabled={props.isDisabled}>
      {props.payable.map((invoice) => (
        <option key={invoice.invoiceId} value={invoice.invoiceId}>
          {invoice.number}
        </option>
      ))}
    </SelectField>
  );
}

function PayCard(props: {
  state: MerchantBillingState;
  invoices: MerchantInvoice[];
  locale: Locale;
}) {
  const translate = useTranslations("merchantBilling");
  const { state } = props;
  const payable = props.invoices.filter((invoice) => invoice.status === "issued");
  if (payable.length === 0) return null;
  const invalid = state.outcome?.kind === "invalid" ? state.outcome.field : undefined;
  const methods = [
    { value: "ccp" as const, label: translate("methodCcp") },
    { value: "baridimob" as const, label: translate("methodBaridimob") },
  ];
  return (
    <Card title={translate("payTitle")} titleId="merchant-billing-pay">
      <p className="ui-page-intro">{translate("payIntro")}</p>
      <form
        className="billing-pay-form"
        aria-busy={state.isSubmitting}
        onSubmit={(event) => {
          event.preventDefault();
          void state.submit(readDraft(event.currentTarget));
        }}
      >
        <InvoiceChoice payable={payable} isDisabled={state.isSubmitting} locale={props.locale} />
        <SegmentedControl
          legend={translate("method")}
          name="method"
          defaultValue={defaultMethod}
          disabled={state.isSubmitting}
          options={methods}
        />
        <TextField
          label={translate("reference")}
          name="reference"
          required
          maxLength={120}
          dir="ltr"
          width="short"
          disabled={state.isSubmitting}
          error={invalid === "reference" ? translate("referenceError") : undefined}
        />
        <ProofPicker isDisabled={state.isSubmitting} isInvalid={invalid === "file"} />
        {invalid === "file" && (
          <p className="ui-field-error" role="alert">
            {translate("fileError")}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" isBlock isLoading={state.isSubmitting}>
          {translate(state.isSubmitting ? "submitting" : "submit")}
        </Button>
      </form>
    </Card>
  );
}

const outcomeKeys = {
  submitted: "submitted",
  "rejected-photo": "photoRejected",
  "upload-expired": "uploadExpired",
  stale: "stale",
  "sign-in": "signInRequired",
  error: "saveError",
} as const satisfies Readonly<Record<Exclude<TransferResult["kind"], "invalid">, string>>;

function useOutcomeToast(state: MerchantBillingState) {
  const translate = useTranslations("merchantBilling");
  const toast = useToast();
  const { outcome, outcomeId } = state;
  useEffect(() => {
    if (outcome === undefined || outcome.kind === "invalid") return;
    toast.show(
      translate(outcomeKeys[outcome.kind]),
      outcome.kind === "submitted" ? "success" : "danger",
    );
  }, [outcome, outcomeId, toast, translate]);
}

function ReadyView(props: {
  merchantId: string;
  view: Ready;
  state: MerchantBillingState;
  locale: Locale;
}) {
  const translate = useTranslations("merchantBilling");
  const { view, locale } = props;
  const banner = billingBanner(view.subscription, view.invoices);
  const canPay = view.invoices.some((invoice) => invoice.status === "issued");
  return (
    <div className="billing-layout">
      {banner !== undefined && <Banner banner={banner} canPay={canPay && banner !== "trial"} />}
      <Plan subscription={view.subscription} locale={locale} />
      <div className="billing-two-columns">
        <Card title={translate("invoices")} titleId="merchant-billing-invoices">
          <InvoiceList merchantId={props.merchantId} invoices={view.invoices} locale={locale} />
        </Card>
        <div className="billing-layout">
          <PayCard state={props.state} invoices={view.invoices} locale={locale} />
          {!view.isOnlinePaymentEnabled && (
            <p className="billing-row-meta">
              <Icon name="card" size={16} />
              {translate("onlineSoon")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const defaultMethod: TransferMethod = "ccp";
const failureKeys = {
  "sign-in": "signInRequired",
  "not-found": "notFound",
  error: "loadError",
} as const;

/** MER-22 view: pure rendering of a billing state (page and design gallery). */
export function MerchantBillingView(props: {
  merchantId: string;
  state: MerchantBillingState;
  locale: Locale;
}) {
  const translate = useTranslations("merchantBilling");
  const { state } = props;
  useOutcomeToast(state);
  const { view } = state;
  return (
    <section className="billing-page" aria-labelledby="merchant-billing-title">
      <PageHeader
        title={translate("title")}
        intro={translate("intro")}
        titleId="merchant-billing-title"
      />
      {view.kind === "loading" && <Skeleton label={translate("loading")} lines={6} />}
      {view.kind === "ready" && (
        <ReadyView merchantId={props.merchantId} view={view} state={state} locale={props.locale} />
      )}
      {view.kind === "error" && (
        <ErrorState
          title={translate("loadError")}
          retryLabel={translate("retry")}
          onRetry={state.refresh}
        />
      )}
      {(view.kind === "sign-in" || view.kind === "not-found") && (
        <ErrorState title={translate(failureKeys[view.kind])} />
      )}
    </section>
  );
}

/** MER-22: the restaurant's billing page. */
export function MerchantBilling({ merchantId, locale }: { merchantId: string; locale: Locale }) {
  return (
    <MerchantBillingView
      merchantId={merchantId}
      state={useMerchantBilling(merchantId)}
      locale={locale}
    />
  );
}
