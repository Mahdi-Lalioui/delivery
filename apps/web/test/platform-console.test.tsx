import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { PlatformConsoleView } from "../src/admin/platform/platform-console";
import type { PlatformState } from "../src/admin/platform/use-platform";
import { platformMockIds as ids, platformMockState } from "./mocks/platform-handlers";

function render(overrides: Partial<PlatformState>, locale: "fr" | "en" = "fr") {
  const state: PlatformState = {
    view: { kind: "loading" },
    audit: { kind: "loading" },
    entity: undefined,
    notice: undefined,
    isSaving: false,
    filterAudit: vi.fn(),
    setFlag: vi.fn(),
    setSetting: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
  const { adminPlatform } = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={{ adminPlatform }} timeZone="Africa/Algiers">
      <PlatformConsoleView state={state} />
    </NextIntlClientProvider>,
  );
}

const mock = platformMockState();
const ready = {
  kind: "ready" as const,
  sessionId: ids.sessionId,
  settings: mock.settings,
  flags: { ramadan_mode: true, online_payments: false, menu_photo_import: false },
};

test("[ADM-08] shows kill switches as toggles, money and seconds fields with units, and the banner editor", () => {
  const html = render({
    view: ready,
    audit: { kind: "ready", events: mock.audit, nextCursor: null },
  });
  const { adminPlatform } = getMessages("fr");
  expect(html.match(/role="switch"/g)).toHaveLength(4);
  expect(html).toContain(adminPlatform.flag_ramadan_mode);
  expect(html).toContain("ui-field-money");
  expect(html).toContain('value="5000"');
  expect(html).toContain('value="180"');
  expect(html).toContain(adminPlatform.bannerShow);
});

test("[ADM-09] lists audit events with entity filter chips and an empty state", () => {
  const { adminPlatform } = getMessages("en");
  const html = render(
    { view: ready, audit: { kind: "ready", events: mock.audit, nextCursor: null } },
    "en",
  );
  expect(html.match(/class="ui-chip"/g)).toHaveLength(9);
  expect(html).toContain("flag.enabled");
  expect(html).toContain("Début du Ramadan");
  expect(
    render({ view: ready, audit: { kind: "ready", events: [], nextCursor: null } }, "en"),
  ).toContain(adminPlatform.auditEmpty);
  expect(render({}, "en")).toContain('class="ui-skeleton"');
  expect(render({ view: { kind: "error" } }, "en")).toContain(adminPlatform.retry);
});
