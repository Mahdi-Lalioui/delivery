"use client";

import { useFormatter, useTranslations } from "next-intl";
import {
  billingBanner,
  invoicePdfUrl,
  type MerchantInvoice,
  type MerchantSubscription,
  type TransferResult,
} from "./merchant-billing-http";
import { useMerchantBilling, type MerchantBillingState } from "./use-merchant-billing";

const bannerKeys = {
  trial: "bannerTrial",
  due: "bannerDue",
  past_due: "bannerPastDue",
  suspended: "bannerSuspended",
} as const;
const statusKeys = {
  trialing: "statusTrialing",
  active: "statusActive",
  past_due: "statusPastDue",
  suspended: "statusSuspended",
  cancelled: "statusCancelled",
} as const;
const invoiceKeys = { issued: "invoiceIssued", paid: "invoicePaid", void: "invoiceVoid" } as const;
const timeZone = "Africa/Algiers";

function useMoney() {
  const format = useFormatter();
  return (amountDzd: number) =>
    format.number(amountDzd, { style: "currency", currency: "DZD", maximumFractionDigits: 0 });
}

function Plan({ subscription }: { subscription: MerchantSubscription | null }) {
  const translate = useTranslations("merchantBilling");
  const format = useFormatter();
  const money = useMoney();
  if (subscription === null) return <p>{translate("noPlan")}</p>;
  const date = (value: string) => format.dateTime(new Date(value), { dateStyle: "long", timeZone });
  return (
    <dl className="merchant-billing-plan">
      <dt>{translate("status")}</dt>
      <dd>{translate(statusKeys[subscription.status])}</dd>
      <dt>{translate("price")}</dt>
      <dd>{money(subscription.priceDzd)}</dd>
      {subscription.trialEndsAt !== null && (
        <>
          <dt>{translate("trialEnds")}</dt>
          <dd>{date(subscription.trialEndsAt)}</dd>
        </>
      )}
      {subscription.nextInvoiceAt !== null && (
        <>
          <dt>{translate("nextInvoice")}</dt>
          <dd>{date(subscription.nextInvoiceAt)}</dd>
        </>
      )}
    </dl>
  );
}

function InvoiceRows({
  merchantId,
  invoices,
}: {
  merchantId: string;
  invoices: MerchantInvoice[];
}) {
  const translate = useTranslations("merchantBilling");
  const format = useFormatter();
  const money = useMoney();
  if (invoices.length === 0) return <p>{translate("noInvoices")}</p>;
  return (
    <table className="admin-merchant-table">
      <thead>
        <tr>
          <th scope="col">{translate("number")}</th>
          <th scope="col">{translate("period")}</th>
          <th scope="col">{translate("total")}</th>
          <th scope="col">{translate("status")}</th>
          <th scope="col">{translate("downloadPdf")}</th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((invoice) => (
          <tr key={invoice.invoiceId}>
            <th scope="row">
              <bdi>{invoice.number}</bdi>
            </th>
            <td>
              {format.dateTimeRange(
                new Date(invoice.period.startsAt),
                new Date(invoice.period.endsAt),
                {
                  dateStyle: "medium",
                  timeZone,
                },
              )}
            </td>
            <td>{money(invoice.totalDzd)}</td>
            <td>{translate(invoiceKeys[invoice.status])}</td>
            <td>
              {invoice.pdfAvailable && (
                <a
                  href={invoicePdfUrl(merchantId, invoice.invoiceId)}
                  download
                  aria-label={translate("downloadInvoice", { number: invoice.number })}
                >
                  {translate("downloadPdf")}
                </a>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const outcomeKeys = {
  submitted: "submitted",
  "rejected-photo": "photoRejected",
  "upload-expired": "uploadExpired",
  stale: "stale",
  "sign-in": "signInRequired",
  error: "saveError",
} as const;

function outcomeKey(outcome: TransferResult) {
  if (outcome.kind === "invalid") return outcome.field === "file" ? "fileError" : "referenceError";
  return outcomeKeys[outcome.kind];
}

function readDraft(form: HTMLFormElement) {
  const data = new FormData(form);
  const text = (name: string) => {
    const value = data.get(name);
    return typeof value === "string" ? value : "";
  };
  const file = data.get("proof");
  return {
    invoiceId: text("invoiceId"),
    method: text("method") === "baridimob" ? ("baridimob" as const) : ("ccp" as const),
    reference: text("reference"),
    file: file instanceof File && file.size > 0 ? file : undefined,
  };
}

function TransferForm({
  state,
  invoices,
}: {
  state: MerchantBillingState;
  invoices: MerchantInvoice[];
}) {
  const translate = useTranslations("merchantBilling");
  const money = useMoney();
  const payable = invoices.filter((invoice) => invoice.status === "issued");
  if (payable.length === 0) return null;
  const { outcome } = state;
  const isSuccess = outcome?.kind === "submitted";
  return (
    <section className="merchant-billing-pay" aria-labelledby="merchant-billing-pay">
      <h2 id="merchant-billing-pay">{translate("payTitle")}</h2>
      <p>{translate("payIntro")}</p>
      <form
        className="admin-merchant-form"
        aria-busy={state.isSubmitting}
        onSubmit={(event) => {
          event.preventDefault();
          void state.submit(readDraft(event.currentTarget));
        }}
      >
        <label className="admin-merchant-field">
          <span>{translate("invoice")}</span>
          <select name="invoiceId" disabled={state.isSubmitting}>
            {payable.map((invoice) => (
              <option key={invoice.invoiceId} value={invoice.invoiceId}>
                {translate("invoiceOption", {
                  number: invoice.number,
                  total: money(invoice.totalDzd),
                })}
              </option>
            ))}
          </select>
        </label>
        <fieldset disabled={state.isSubmitting}>
          <legend>{translate("method")}</legend>
          <label>
            <input type="radio" name="method" value="ccp" defaultChecked /> {translate("methodCcp")}
          </label>
          <label>
            <input type="radio" name="method" value="baridimob" /> {translate("methodBaridimob")}
          </label>
        </fieldset>
        <label className="admin-merchant-field">
          <span>{translate("reference")}</span>
          <input
            name="reference"
            required
            maxLength={120}
            disabled={state.isSubmitting}
            dir="ltr"
          />
        </label>
        <label className="admin-merchant-field">
          <span>{translate("proof")}</span>
          <input
            name="proof"
            type="file"
            required
            accept="image/jpeg,image/png,image/heic,image/webp"
            disabled={state.isSubmitting}
          />
        </label>
        <button className="admin-merchant-button" type="submit" disabled={state.isSubmitting}>
          {translate(state.isSubmitting ? "submitting" : "submit")}
        </button>
        {outcome !== undefined && (
          <p
            className={isSuccess ? "admin-merchant-success" : "admin-merchant-error"}
            role={isSuccess ? "status" : "alert"}
          >
            {translate(outcomeKey(outcome))}
          </p>
        )}
      </form>
    </section>
  );
}

function Ready({ merchantId, state }: { merchantId: string; state: MerchantBillingState }) {
  const translate = useTranslations("merchantBilling");
  if (state.view.kind !== "ready") return null;
  const { subscription, invoices, isOnlinePaymentEnabled } = state.view;
  const banner = billingBanner(subscription, invoices);
  return (
    <>
      {banner !== undefined && (
        <p className={`merchant-billing-banner merchant-billing-banner-${banner}`} role="status">
          {translate(bannerKeys[banner])}
        </p>
      )}
      <section aria-labelledby="merchant-billing-plan">
        <h2 id="merchant-billing-plan">{translate("plan")}</h2>
        <Plan subscription={subscription} />
      </section>
      <section aria-labelledby="merchant-billing-invoices">
        <h2 id="merchant-billing-invoices">{translate("invoices")}</h2>
        <InvoiceRows merchantId={merchantId} invoices={invoices} />
      </section>
      <TransferForm state={state} invoices={invoices} />
      {!isOnlinePaymentEnabled && <p>{translate("onlineSoon")}</p>}
    </>
  );
}

const failureKeys = {
  "sign-in": "signInRequired",
  "not-found": "notFound",
  error: "loadError",
} as const;

/** MER-22: the restaurant's billing page. */
export function MerchantBilling({ merchantId }: { merchantId: string }) {
  const translate = useTranslations("merchantBilling");
  const state = useMerchantBilling(merchantId);
  const { view } = state;
  return (
    <section className="admin-merchant" aria-labelledby="merchant-billing-title">
      <header className="admin-merchant-heading">
        <h1 id="merchant-billing-title">{translate("title")}</h1>
        <p>{translate("intro")}</p>
      </header>
      {view.kind === "loading" && <p role="status">{translate("loading")}</p>}
      {view.kind === "ready" && <Ready merchantId={merchantId} state={state} />}
      {view.kind !== "loading" && view.kind !== "ready" && (
        <div className="admin-merchant-notice">
          <p role="alert">{translate(failureKeys[view.kind])}</p>
          {view.kind === "error" && (
            <button className="admin-merchant-button" type="button" onClick={state.refresh}>
              {translate("retry")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
