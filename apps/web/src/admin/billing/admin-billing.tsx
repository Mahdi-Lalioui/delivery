"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { AdminInvoice, AdminSubscription, AdminTransferProof } from "./admin-billing-http";
import { useAdminBilling, type AdminBillingState } from "./use-admin-billing";

const subscriptionKeys = {
  trialing: "statusTrialing",
  active: "statusActive",
  past_due: "statusPastDue",
  suspended: "statusSuspended",
  cancelled: "statusCancelled",
} as const;
const invoiceKeys = { issued: "invoiceIssued", paid: "invoicePaid", void: "invoiceVoid" } as const;
const methodKeys = { ccp: "methodCcp", baridimob: "methodBaridimob" } as const;

function readReason(form: HTMLFormElement): string {
  const value = new FormData(form).get("reason");
  return typeof value === "string" ? value : "";
}

function ReasonForm(props: {
  label: string;
  disabled: boolean;
  onReason: (reason: string) => void;
}) {
  const translate = useTranslations("adminBilling");
  return (
    <form
      className="admin-billing-action"
      onSubmit={(event) => {
        event.preventDefault();
        props.onReason(readReason(event.currentTarget));
      }}
    >
      <label className="admin-merchant-field">
        <span>{translate("reason")}</span>
        <input name="reason" required maxLength={500} disabled={props.disabled} />
      </label>
      <button className="admin-merchant-button" type="submit" disabled={props.disabled}>
        {props.label}
      </button>
    </form>
  );
}

function Money({ amountDzd }: { amountDzd: number }) {
  const format = useFormatter();
  return (
    <>
      {format.number(amountDzd, { style: "currency", currency: "DZD", maximumFractionDigits: 0 })}
    </>
  );
}

function Transfers({ rows, state }: { rows: AdminTransferProof[]; state: AdminBillingState }) {
  const translate = useTranslations("adminBilling");
  if (rows.length === 0) return <p>{translate("emptyTransfers")}</p>;
  return (
    <ul className="admin-billing-list">
      {rows.map((proof) => (
        <li key={proof.transferProofId}>
          <p className="admin-billing-facts">
            <span>{translate(methodKeys[proof.method])}</span>
            <bdi>{proof.reference}</bdi>
          </p>
          <ReasonForm
            label={translate("confirmTransfer")}
            disabled={state.isSaving}
            onReason={(reason) => {
              void state.confirmTransfer(proof.transferProofId, reason);
            }}
          />
        </li>
      ))}
    </ul>
  );
}

function Invoices({ rows, state }: { rows: AdminInvoice[]; state: AdminBillingState }) {
  const translate = useTranslations("adminBilling");
  const format = useFormatter();
  if (rows.length === 0) return <p>{translate("emptyInvoices")}</p>;
  return (
    <table className="admin-merchant-table">
      <thead>
        <tr>
          <th scope="col">{translate("number")}</th>
          <th scope="col">{translate("period")}</th>
          <th scope="col">{translate("total")}</th>
          <th scope="col">{translate("status")}</th>
          <th scope="col">{translate("actions")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((invoice) => (
          <tr key={invoice.invoiceId}>
            <th scope="row">
              <bdi>{invoice.number}</bdi>
            </th>
            <td>
              {format.dateTimeRange(
                new Date(invoice.period.startsAt),
                new Date(invoice.period.endsAt),
                { dateStyle: "medium", timeZone: "Africa/Algiers" },
              )}
            </td>
            <td>
              <Money amountDzd={invoice.totalDzd} />
            </td>
            <td>{translate(invoiceKeys[invoice.status])}</td>
            <td>
              {invoice.status === "issued" && (
                <ReasonForm
                  label={translate("voidInvoice")}
                  disabled={state.isSaving}
                  onReason={(reason) => {
                    void state.voidInvoice(invoice.invoiceId, reason);
                  }}
                />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Subscriptions({ rows }: { rows: AdminSubscription[] }) {
  const translate = useTranslations("adminBilling");
  if (rows.length === 0) return <p>{translate("emptySubscriptions")}</p>;
  return (
    <ul className="admin-billing-list">
      {rows.map((row) => (
        <li key={row.subscriptionId} className="admin-billing-facts">
          <bdi>{row.merchantId}</bdi>
          <span>{translate(subscriptionKeys[row.status])}</span>
          <Money amountDzd={row.priceDzd} />
        </li>
      ))}
    </ul>
  );
}

function Notice({ state }: { state: AdminBillingState }) {
  const translate = useTranslations("adminBilling");
  if (state.notice === undefined) return null;
  const isSuccess = state.notice === "recorded" || state.notice === "voided";
  return (
    <p
      className={isSuccess ? "admin-merchant-success" : "admin-merchant-error"}
      role={isSuccess ? "status" : "alert"}
    >
      {translate(state.notice)}
    </p>
  );
}

function Body({ state }: { state: AdminBillingState }) {
  const translate = useTranslations("adminBilling");
  const { view } = state;
  if (view.kind === "loading") return <p role="status">{translate("loading")}</p>;
  if (view.kind === "sign-in") return <p role="alert">{translate("signInRequired")}</p>;
  if (view.kind === "error") {
    return (
      <div className="admin-merchant-notice">
        <p role="alert">{translate("loadError")}</p>
        <button className="admin-merchant-button" type="button" onClick={state.refresh}>
          {translate("retry")}
        </button>
      </div>
    );
  }
  return (
    <>
      <section aria-labelledby="billing-transfers">
        <h2 id="billing-transfers">{translate("transfers")}</h2>
        <Transfers rows={view.transferProofs} state={state} />
      </section>
      <section aria-labelledby="billing-invoices">
        <h2 id="billing-invoices">{translate("invoices")}</h2>
        <Invoices rows={view.invoices} state={state} />
      </section>
      <section aria-labelledby="billing-subscriptions">
        <h2 id="billing-subscriptions">{translate("subscriptions")}</h2>
        <Subscriptions rows={view.subscriptions} />
      </section>
    </>
  );
}

/** ADM-07: the admin billing console. */
export function AdminBilling() {
  const translate = useTranslations("adminBilling");
  const state = useAdminBilling();
  return (
    <section className="admin-merchant" aria-labelledby="admin-billing-title">
      <header className="admin-merchant-heading">
        <h1 id="admin-billing-title">{translate("title")}</h1>
        <p>{translate("intro")}</p>
      </header>
      <Notice state={state} />
      <Body state={state} />
    </section>
  );
}
