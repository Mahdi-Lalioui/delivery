import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { AdminBilling } from "../src/admin/billing/admin-billing";
import { useAdminBilling, type AdminBillingState } from "../src/admin/billing/use-admin-billing";
import { billingMockData } from "./mocks/admin-billing-handlers";

vi.mock("../src/admin/billing/use-admin-billing", () => ({ useAdminBilling: vi.fn() }));

function render(overrides: Partial<AdminBillingState>, locale: "fr" | "en" = "fr") {
  vi.mocked(useAdminBilling).mockReturnValue({
    view: { kind: "loading" },
    notice: undefined,
    isSaving: false,
    refresh: vi.fn(),
    confirmTransfer: vi.fn(),
    voidInvoice: vi.fn(),
    ...overrides,
  });
  const { adminBilling } = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={{ adminBilling }} timeZone="Africa/Algiers">
      <AdminBilling />
    </NextIntlClientProvider>,
  );
}

const { invoices, transferProofs } = billingMockData();
const ready = { kind: "ready" as const, subscriptions: [], invoices, transferProofs };

test("[ADM-07:web] shows issued, paid and pending transfer states with localized labels", () => {
  const html = render({ view: ready });
  const { adminBilling } = getMessages("fr");
  expect(html).toContain("2027-000002");
  expect(html).toContain(adminBilling.invoiceIssued);
  expect(html).toContain(adminBilling.invoicePaid);
  expect(html).toContain("BM-2027-0042");
  expect(html).toContain(adminBilling.confirmTransfer);
  // Only the issued invoice can be voided.
  expect(html.split(adminBilling.voidInvoice)).toHaveLength(2);
});

test("[ADM-07:web] renders loading, sign-in and error states", () => {
  const { adminBilling } = getMessages("en");
  expect(render({}, "en")).toContain(adminBilling.loading);
  expect(render({ view: { kind: "sign-in" } }, "en")).toContain(adminBilling.signInRequired);
  expect(render({ view: { kind: "error" } }, "en")).toContain(adminBilling.retry);
  expect(render({ view: ready, notice: "recorded" }, "en")).toContain(adminBilling.recorded);
});
