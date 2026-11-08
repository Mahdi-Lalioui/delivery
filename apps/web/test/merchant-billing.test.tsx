import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { MerchantBilling } from "../src/admin/billing/merchant-billing";
import {
  useMerchantBilling,
  type MerchantBillingState,
} from "../src/admin/billing/use-merchant-billing";
import { billingMockIds as ids } from "./mocks/admin-billing-handlers";
import { merchantBillingMockState } from "./mocks/merchant-billing-handlers";

vi.mock("../src/admin/billing/use-merchant-billing", () => ({ useMerchantBilling: vi.fn() }));

type Locale = "ar" | "fr" | "en";

function render(overrides: Partial<MerchantBillingState>, locale: Locale = "fr") {
  vi.mocked(useMerchantBilling).mockReturnValue({
    view: { kind: "loading" },
    outcome: undefined,
    isSubmitting: false,
    refresh: vi.fn(),
    submit: vi.fn(),
    ...overrides,
  });
  const { merchantBilling } = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={{ merchantBilling }}
      timeZone="Africa/Algiers"
    >
      <MerchantBilling merchantId={ids.merchantId} />
    </NextIntlClientProvider>,
  );
}

function ready(status: "trialing" | "active" | "past_due" | "suspended") {
  const { subscription, invoices } = merchantBillingMockState(status);
  return { kind: "ready" as const, subscription, invoices, isOnlinePaymentEnabled: false };
}

test.each([
  ["past_due", "bannerPastDue"],
  ["suspended", "bannerSuspended"],
  ["active", "bannerDue"],
  ["trialing", "bannerTrial"],
] as const)("[MER-22] shows the %s banner", (status, key) => {
  expect(render({ view: ready(status) })).toContain(getMessages("fr").merchantBilling[key]);
});

test("[MER-22] lists invoices with PDF links and offers transfer payment for the open one", () => {
  const html = render({ view: ready("past_due") }, "ar");
  const { merchantBilling } = getMessages("ar");
  expect(html).toContain("2027-000002");
  expect(html).toContain(`/v1/merchants/${ids.merchantId}/invoices/${ids.issuedInvoiceId}/pdf`);
  expect(html).toContain(merchantBilling.payTitle);
  expect(html).toContain('accept="image/jpeg,image/png,image/heic,image/webp"');
  // Only the issued invoice is payable.
  expect(html.match(/<option /g)).toHaveLength(1);
});

test("[MER-22] reports submission outcomes and load failures", () => {
  const { merchantBilling } = getMessages("en");
  const view = ready("past_due");
  expect(render({ view, outcome: { kind: "submitted" } }, "en")).toContain(
    merchantBilling.submitted,
  );
  expect(render({ view, outcome: { kind: "invalid", field: "reference" } }, "en")).toContain(
    merchantBilling.referenceError,
  );
  expect(render({ view, outcome: { kind: "rejected-photo" } }, "en")).toContain(
    merchantBilling.photoRejected,
  );
  expect(render({}, "en")).toContain(merchantBilling.loading);
  expect(render({ view: { kind: "not-found" } }, "en")).toContain(merchantBilling.notFound);
  expect(render({ view: { kind: "error" } }, "en")).toContain(merchantBilling.retry);
});
