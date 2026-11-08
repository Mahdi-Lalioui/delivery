import { billingSettingsDefaults } from "@zaafran/contracts/billing";
import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { BillingSettings } from "../src/admin/billing/billing-settings";
import { settingsToDraft } from "../src/admin/billing/billing-settings-http";
import {
  useBillingSettings,
  type BillingSettingsState,
} from "../src/admin/billing/use-billing-settings";
import { billingMockIds as ids } from "./mocks/admin-billing-handlers";

vi.mock("../src/admin/billing/use-billing-settings", () => ({ useBillingSettings: vi.fn() }));

const ready = {
  kind: "ready" as const,
  sessionId: ids.sessionId,
  settings: billingSettingsDefaults,
};

function render(overrides: Partial<BillingSettingsState>, locale: "fr" | "en" = "fr") {
  vi.mocked(useBillingSettings).mockReturnValue({
    view: { kind: "loading" },
    draft: undefined,
    outcome: undefined,
    isSaving: false,
    change: vi.fn(),
    save: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  });
  const { adminBillingSettings } = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={{ adminBillingSettings }}>
      <BillingSettings />
    </NextIntlClientProvider>,
  );
}

test("[BIL-01][ADM-08] shows the current settings in an editable form", () => {
  const html = render({ view: ready, draft: settingsToDraft(billingSettingsDefaults) });
  const { adminBillingSettings } = getMessages("fr");
  expect(html).toContain('value="5000"');
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
  expect(
    render(
      { view: ready, draft, outcome: { kind: "saved", settings: billingSettingsDefaults } },
      "en",
    ),
  ).toContain(adminBillingSettings.saved);
  expect(render({ view: { kind: "error" } }, "en")).toContain(adminBillingSettings.retry);
});
