"use client";

import type { Locale } from "@zaafran/i18n/locales";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  KpiTile,
  PageHeader,
  Skeleton,
  TextField,
  useToast,
} from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { AdminInvoice, AdminSubscription, AdminTransferProof } from "./admin-billing-http";
import { InvoiceBadge, Money, Period, SubscriptionBadge } from "./billing-display";
import { useAdminBilling, type AdminBillingState } from "./use-admin-billing";

type Ready = Extract<AdminBillingState["view"], { kind: "ready" }>;
const methodKeys = { ccp: "methodCcp", baridimob: "methodBaridimob" } as const;

function readReason(form: HTMLFormElement): string {
  const value = new FormData(form).get("reason");
  return typeof value === "string" ? value : "";
}

/** A reason is required for every money write; the form opens only when the admin asks for it. */
function ReasonAction(props: {
  open: string;
  confirm: string;
  variant: "primary" | "destructive";
  isDisabled: boolean;
  onReason: (reason: string) => void;
}) {
  const translate = useTranslations("adminBilling");
  const [isOpen, setIsOpen] = useState(false);
  if (!isOpen) {
    const variant = props.variant === "primary" ? "primary" : "danger-ghost";
    return (
      <Button
        variant={variant}
        size="sm"
        disabled={props.isDisabled}
        onClick={() => {
          setIsOpen(true);
        }}
      >
        {props.open}
      </Button>
    );
  }
  return (
    <form
      className="billing-reason"
      onSubmit={(event) => {
        event.preventDefault();
        props.onReason(readReason(event.currentTarget));
      }}
    >
      <TextField
        label={translate("reason")}
        name="reason"
        required
        maxLength={500}
        autoFocus
        disabled={props.isDisabled}
      />
      <div className="billing-reason-actions">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setIsOpen(false);
          }}
        >
          {translate("cancel")}
        </Button>
        <Button type="submit" variant={props.variant} size="sm" isLoading={props.isDisabled}>
          {props.confirm}
        </Button>
      </div>
    </form>
  );
}

function TransferRow({
  proof,
  invoice,
  state,
  locale,
}: {
  proof: AdminTransferProof;
  invoice: AdminInvoice | undefined;
  state: AdminBillingState;
  locale: Locale;
}) {
  const translate = useTranslations("adminBilling");
  return (
    <li className="billing-row">
      <span className="billing-row-icon" aria-hidden="true">
        <Icon name="receipt" />
      </span>
      <div className="billing-row-main">
        <p className="billing-row-title">
          <bdi>{invoice?.number ?? translate("unknownInvoice")}</bdi>
          {invoice !== undefined && <Money amountDzd={invoice.totalDzd} locale={locale} />}
        </p>
        <p className="billing-row-meta">
          <Badge tone="info">{translate(methodKeys[proof.method])}</Badge>
          <span>
            {translate("reference")} <bdi dir="ltr">{proof.reference}</bdi>
          </span>
        </p>
      </div>
      <ReasonAction
        open={translate("confirmTransfer")}
        confirm={translate("confirmTransfer")}
        variant="primary"
        isDisabled={state.isSaving}
        onReason={(reason) => {
          void state.confirmTransfer(proof.transferProofId, reason);
        }}
      />
    </li>
  );
}

function Transfers({
  view,
  state,
  locale,
}: {
  view: Ready;
  state: AdminBillingState;
  locale: Locale;
}) {
  const translate = useTranslations("adminBilling");
  return (
    <Card title={translate("transfers")} titleId="billing-transfers">
      {view.transferProofs.length === 0 ? (
        <EmptyState
          icon="check"
          title={translate("emptyTransfers")}
          body={translate("emptyTransfersBody")}
        />
      ) : (
        <ul className="billing-rows">
          {view.transferProofs.map((proof) => (
            <TransferRow
              key={proof.transferProofId}
              proof={proof}
              invoice={view.invoices.find((row) => row.invoiceId === proof.invoiceId)}
              state={state}
              locale={locale}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function InvoiceRow({
  invoice,
  state,
  locale,
}: {
  invoice: AdminInvoice;
  state: AdminBillingState;
  locale: Locale;
}) {
  const translate = useTranslations("adminBilling");
  return (
    <tr>
      <th scope="row">
        <bdi>{invoice.number}</bdi>
      </th>
      <td>
        <Period
          startsAt={invoice.period.startsAt}
          endsAt={invoice.period.endsAt}
          namespace="adminBilling"
        />
      </td>
      <td className="billing-cell-number">
        <Money amountDzd={invoice.totalDzd} locale={locale} />
      </td>
      <td>
        <InvoiceBadge status={invoice.status} namespace="adminBilling" />
      </td>
      <td className="billing-cell-action">
        {invoice.status === "issued" && (
          <ReasonAction
            open={translate("voidInvoice")}
            confirm={translate("confirmVoid")}
            variant="destructive"
            isDisabled={state.isSaving}
            onReason={(reason) => {
              void state.voidInvoice(invoice.invoiceId, reason);
            }}
          />
        )}
      </td>
    </tr>
  );
}

function Invoices({
  view,
  state,
  locale,
}: {
  view: Ready;
  state: AdminBillingState;
  locale: Locale;
}) {
  const translate = useTranslations("adminBilling");
  return (
    <Card title={translate("invoices")} titleId="billing-invoices">
      {view.invoices.length === 0 ? (
        <EmptyState icon="receipt" title={translate("emptyInvoices")} />
      ) : (
        <div className="billing-table-scroll">
          <table className="billing-table">
            <thead>
              <tr>
                <th scope="col">{translate("number")}</th>
                <th scope="col">{translate("period")}</th>
                <th scope="col" className="billing-cell-number">
                  {translate("total")}
                </th>
                <th scope="col">{translate("status")}</th>
                <th scope="col">
                  <span className="ui-visually-hidden">{translate("actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {view.invoices.map((invoice) => (
                <InvoiceRow
                  key={invoice.invoiceId}
                  invoice={invoice}
                  state={state}
                  locale={locale}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Subscriptions({ rows, locale }: { rows: AdminSubscription[]; locale: Locale }) {
  const translate = useTranslations("adminBilling");
  return (
    <Card title={translate("subscriptions")} titleId="billing-subscriptions" tone="sunken">
      {rows.length === 0 ? (
        <EmptyState title={translate("emptySubscriptions")} />
      ) : (
        <ul className="billing-rows">
          {rows.map((row) => (
            <li key={row.subscriptionId} className="billing-row">
              <div className="billing-row-main">
                <p className="billing-row-title">
                  {/* The contract has no restaurant name yet (docs/requests/lane-b-billing.md). */}
                  <bdi dir="ltr" className="billing-id">
                    {row.merchantId.slice(0, 8)}
                  </bdi>
                  <Money amountDzd={row.priceDzd} locale={locale} />
                </p>
              </div>
              <SubscriptionBadge status={row.status} namespace="adminBilling" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Summary({ view, locale }: { view: Ready; locale: Locale }) {
  const translate = useTranslations("adminBilling");
  const openInvoices = view.invoices.filter((row) => row.status === "issued");
  const overdue = view.subscriptions.filter(
    (row) => row.status === "past_due" || row.status === "suspended",
  );
  return (
    <div className="billing-kpis">
      <KpiTile
        label={translate("kpiOpen")}
        value={
          <Money
            amountDzd={openInvoices.reduce((sum, row) => sum + row.totalDzd, 0)}
            locale={locale}
          />
        }
        detail={translate("kpiOpenCount", { count: openInvoices.length })}
      />
      <KpiTile label={translate("kpiTransfers")} value={view.transferProofs.length} />
      <KpiTile label={translate("kpiOverdue")} value={overdue.length} />
    </div>
  );
}

const noticeTones = {
  recorded: "success",
  voided: "success",
  stale: "danger",
  saveError: "danger",
  reasonError: "danger",
} as const;

function useNoticeToast(state: AdminBillingState) {
  const translate = useTranslations("adminBilling");
  const toast = useToast();
  const { notice, noticeId } = state;
  useEffect(() => {
    if (notice !== undefined) toast.show(translate(notice), noticeTones[notice]);
  }, [notice, noticeId, toast, translate]);
}

/** ADM-07 view: pure rendering of a billing state (used by the page and the design gallery). */
export function AdminBillingView({ state, locale }: { state: AdminBillingState; locale: Locale }) {
  const translate = useTranslations("adminBilling");
  useNoticeToast(state);
  const { view } = state;
  return (
    <section className="billing-page" aria-labelledby="admin-billing-title">
      <PageHeader
        title={translate("title")}
        intro={translate("intro")}
        titleId="admin-billing-title"
      />
      {view.kind === "loading" && <Skeleton label={translate("loading")} lines={6} />}
      {view.kind === "sign-in" && <ErrorState title={translate("signInRequired")} />}
      {view.kind === "error" && (
        <ErrorState
          title={translate("loadError")}
          retryLabel={translate("retry")}
          onRetry={state.refresh}
        />
      )}
      {view.kind === "ready" && (
        <div className="billing-layout">
          <Summary view={view} locale={locale} />
          <Transfers view={view} state={state} locale={locale} />
          <Invoices view={view} state={state} locale={locale} />
          <Subscriptions rows={view.subscriptions} locale={locale} />
        </div>
      )}
    </section>
  );
}

/** ADM-07: the admin billing console. */
export function AdminBilling({ locale }: { locale: Locale }) {
  return <AdminBillingView state={useAdminBilling()} locale={locale} />;
}
