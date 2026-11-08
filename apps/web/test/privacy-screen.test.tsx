import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { PrivacyView } from "../src/retention/privacy/privacy-screen";
import type { PrivacyState } from "../src/retention/privacy/use-privacy";

function render(overrides: Partial<PrivacyState>, locale: "ar" | "fr" | "en" = "fr") {
  const state: PrivacyState = {
    step: { kind: "idle" },
    isBusy: false,
    exportStatus: "idle",
    deleteError: undefined,
    downloadExport: vi.fn(),
    sendCode: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
    ...overrides,
  };
  const { retentionPrivacy } = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={{ retentionPrivacy }}>
      <PrivacyView state={state} homeHref={`/${locale}`} />
    </NextIntlClientProvider>,
  );
}

test("[CUS-24] offers the data export and a separated danger zone that starts with a code", () => {
  const html = render({});
  const { retentionPrivacy } = getMessages("fr");
  expect(html).toContain(retentionPrivacy.exportButton);
  expect(html).toContain("privacy-danger");
  expect(html).toContain(retentionPrivacy.consequenceUndo);
  expect(html).toContain(retentionPrivacy.deleteStart);
  expect(html).not.toContain(retentionPrivacy.deleteConfirm);
});

test("[CUS-24] asks for the SMS code with autofill before the final destructive action", () => {
  const html = render(
    {
      step: {
        kind: "code-sent",
        challengeId: "019d6abc-0000-7000-8000-000000000802",
        isUncertain: false,
      },
      deleteError: "invalid-code",
    },
    "ar",
  );
  const { retentionPrivacy } = getMessages("ar");
  expect(html).toContain('autoComplete="one-time-code"');
  expect(html).toContain(retentionPrivacy.invalidCode);
  expect(html).toContain("ui-button-destructive");
  expect(html).toContain(retentionPrivacy.cancel);
});

test("[CUS-24] confirms deletion and offers the way home", () => {
  const { retentionPrivacy } = getMessages("en");
  const html = render({ step: { kind: "deleted" } }, "en");
  expect(html).toContain(retentionPrivacy.deletedTitle);
  expect(html).toContain('href="/en"');
});
