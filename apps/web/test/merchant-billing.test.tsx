import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { MerchantBillingView } from "../src/admin/billing/merchant-billing";
import type { MerchantBillingState } from "../src/admin/billing/use-merchant-billing";
import { billingMockIds as ids } from "./mocks/admin-billing-handlers";
import { merchantBillingMockState } from "./mocks/merchant-billing-handlers";

type Locale = "ar" | "fr" | "en";

function render(overrides: Partial<MerchantBillingState>, locale: Locale = "fr") {
  const state: MerchantBillingState = {
    view: { kind: "loading" },
    outcome: undefined,
    outcomeId: 0,
    isSubmitting: false,
    refresh: vi.fn(),
    submit: vi.fn(),
    ...overrides,
  };
  const { merchantBilling } = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={{ merchantBilling }}
      timeZone="Africa/Algiers"
    >
      <MerchantBillingView merchantId={ids.merchantId} state={state} locale={locale} />
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

test("[MER-22] lists invoices with PDF buttons and a pay card with method control and proof drop zone", () => {
  const html = render({ view: ready("past_due") }, "ar");
  const { merchantBilling } = getMessages("ar");
  expect(html).toContain("2027-000002");
  expect(html).toContain(`/v1/merchants/${ids.merchantId}/invoices/${ids.issuedInvoiceId}/pdf`);
  expect(html).toContain(merchantBilling.payTitle);
  expect(html).toContain("ui-segmented");
  expect(html).toContain("billing-dropzone");
  expect(html).toContain('accept="image/jpeg,image/png,image/heic,image/webp"');
  expect(html).toContain("5 000 دج");
  // A single open invoice needs no select.
  expect(html).not.toContain("<select");
});

test("[MER-22] flags invalid fields inline and shows load states", () => {
  const { merchantBilling } = getMessages("en");
  const view = ready("past_due");
  expect(render({ view, outcome: { kind: "invalid", field: "reference" } }, "en")).toContain(
    merchantBilling.referenceError,
  );
  expect(render({ view, outcome: { kind: "invalid", field: "file" } }, "en")).toContain(
    merchantBilling.fileError,
  );
  expect(render({}, "en")).toContain('class="ui-skeleton"');
  expect(render({ view: { kind: "not-found" } }, "en")).toContain(merchantBilling.notFound);
  expect(render({ view: { kind: "error" } }, "en")).toContain(merchantBilling.retry);
});
