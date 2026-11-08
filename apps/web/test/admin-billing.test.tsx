import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { AdminBillingView } from "../src/admin/billing/admin-billing";
import type { AdminBillingState } from "../src/admin/billing/use-admin-billing";
import { billingMockData } from "./mocks/admin-billing-handlers";

function render(overrides: Partial<AdminBillingState>, locale: "fr" | "en" = "fr") {
  const state: AdminBillingState = {
    view: { kind: "loading" },
    notice: undefined,
    noticeId: 0,
    isSaving: false,
    refresh: vi.fn(),
    confirmTransfer: vi.fn(),
    voidInvoice: vi.fn(),
    ...overrides,
  };
  const { adminBilling } = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={{ adminBilling }} timeZone="Africa/Algiers">
      <AdminBillingView state={state} locale={locale} />
    </NextIntlClientProvider>,
  );
}

const { invoices, transferProofs } = billingMockData();
const ready = { kind: "ready" as const, subscriptions: [], invoices, transferProofs };

test("[ADM-07:web] shows KPIs, status badges and the pending transfer with its amount", () => {
  const html = render({ view: ready });
  const { adminBilling } = getMessages("fr");
  expect(html).toContain("ui-kpi");
  expect(html).toContain("5 000 DA");
  expect(html).toContain("ui-badge-warning");
  expect(html).toContain(adminBilling.invoicePaid);
  expect(html).toContain("BM-2027-0042");
  expect(html).toContain(adminBilling.confirmTransfer);
  // Only the issued invoice offers the (quiet, separated) void action.
  expect(html.split(adminBilling.voidInvoice)).toHaveLength(2);
});

test("[ADM-07:web] renders skeleton, sign-in, error and empty states", () => {
  const { adminBilling } = getMessages("en");
  expect(render({}, "en")).toContain('class="ui-skeleton"');
  expect(render({ view: { kind: "sign-in" } }, "en")).toContain(adminBilling.signInRequired);
  expect(render({ view: { kind: "error" } }, "en")).toContain(adminBilling.retry);
  const empty = render(
    { view: { kind: "ready", subscriptions: [], invoices: [], transferProofs: [] } },
    "en",
  );
  expect(empty).toContain(adminBilling.emptyTransfers);
  expect(empty).toContain(adminBilling.emptyInvoices);
});
