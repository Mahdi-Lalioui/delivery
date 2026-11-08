import { billingSettingsDefaults } from "@zaafran/contracts/billing";
import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { BillingSettingsView } from "../src/admin/billing/billing-settings";
import { settingsToDraft } from "../src/admin/billing/billing-settings-http";
import type { BillingSettingsState } from "../src/admin/billing/use-billing-settings";
import { billingMockIds as ids } from "./mocks/admin-billing-handlers";

const ready = {
  kind: "ready" as const,
  sessionId: ids.sessionId,
  settings: billingSettingsDefaults,
};

function render(overrides: Partial<BillingSettingsState>, locale: "fr" | "en" = "fr") {
  const state: BillingSettingsState = {
    view: { kind: "loading" },
    outcomeId: 0,
    draft: undefined,
    outcome: undefined,
    isSaving: false,
    change: vi.fn(),
    save: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
  const { adminBillingSettings } = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={{ adminBillingSettings }}>
      <BillingSettingsView state={state} />
    </NextIntlClientProvider>,
  );
}

test("[BIL-01][ADM-08] shows the current settings in an editable form", () => {
  const html = render({ view: ready, draft: settingsToDraft(billingSettingsDefaults) });
  const { adminBillingSettings } = getMessages("fr");
  expect(html).toContain('value="5000"');
  expect(html).toContain("ui-field-money");
  expect(html).toContain('role="switch"');
  expect(html).toContain('value="30"');
  expect(html).toContain(adminBillingSettings.onlinePayment);
  expect(html).toContain(adminBillingSettings.reason);
});

test("[ADM-08] marks the invalid field and reports outcomes", () => {
  const draft = settingsToDraft(billingSettingsDefaults);
  const html = render(
    { view: ready, draft, outcome: { kind: "invalid", field: "graceDays" } },
    "en",
  );
  expect(html.match(/<input[^>]*name="graceDays"[^>]*>/)?.[0]).toContain('aria-invalid="true"');
  const { adminBillingSettings } = getMessages("en");
  expect(html).toContain(adminBillingSettings.invalid);
  expect(render({}, "en")).toContain('class="ui-skeleton"');
  expect(render({ view: { kind: "error" } }, "en")).toContain(adminBillingSettings.retry);
});
