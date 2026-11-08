import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import {
  HoursPauseControl,
  type HoursPauseControlProps,
} from "../src/merchant-hours/components/hours-pause-control";

const open = { kind: "ready", pausedUntil: null } as const;
const paused = { kind: "ready", pausedUntil: "2026-11-08T19:15:00.000Z" } as const;

function render(locale: "ar" | "fr", overrides: Partial<HoursPauseControlProps> = {}) {
  const props: HoursPauseControlProps = {
    state: open,
    isPaused: false,
    isDisabled: false,
    locale,
    onClose: vi.fn(),
    onReopen: vi.fn(),
    onRetry: vi.fn(),
    onReload: vi.fn(),
    ...overrides,
  };
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      timeZone="Africa/Algiers"
      messages={{ merchantHours: getMessages(locale).merchantHours }}
    >
      <HoursPauseControl {...props} />
    </NextIntlClientProvider>,
  );
}

test("[MER-15] offers three closing durations while the restaurant is open", () => {
  const { merchantHours } = getMessages("fr");
  const html = render("fr");
  expect(html).toContain(merchantHours.pauseTitle);
  expect(html).toContain(merchantHours.pauseFor30);
  expect(html).toContain(merchantHours.pauseFor60);
  expect(html).toContain(merchantHours.pauseFor120);
  expect(html).not.toContain(merchantHours.reopen);
});

test("[MER-15] shows the Algiers reopening time and a reopen action while closed in Arabic", () => {
  const { merchantHours } = getMessages("ar");
  const html = render("ar", { state: paused, isPaused: true });
  expect(html).toContain(merchantHours.pausedUntil.replace("{time}", "20:15"));
  expect(html).toContain(merchantHours.reopen);
  expect(html).not.toContain(merchantHours.pauseFor30);
});

test("[MER-15] offers the exact retry only after an uncertain failure", () => {
  const { merchantHours } = getMessages("fr");
  const retry = { idempotencyKey: "k1", input: { pausedUntil: null, expectedRevision: 4 } };
  const uncertain = render("fr", {
    state: { ...paused, failure: "error", retry },
    isPaused: true,
  });
  expect(uncertain).toContain(merchantHours.saveError);
  expect(uncertain).toContain(merchantHours.pauseRetry);
  const rejected = render("fr", { state: { ...open, failure: "pause-in-past" } });
  expect(rejected).toContain(merchantHours.pauseInPast);
  expect(rejected).not.toContain(merchantHours.pauseRetry);
});

test("[MER-15] asks for a reload after a conflicting closed-now command", () => {
  const { merchantHours } = getMessages("ar");
  const html = render("ar", { state: { ...open, failure: "revision-conflict" } });
  expect(html).toContain(merchantHours.revisionConflict);
  expect(html).toContain("data-hours-reload");
});

test("[MER-15] disables the control while saving and reports an unavailable status", () => {
  const { merchantHours } = getMessages("fr");
  const command = { idempotencyKey: "k1", input: { pausedUntil: null, expectedRevision: 4 } };
  const saving = render("fr", {
    state: { kind: "saving", pausedUntil: paused.pausedUntil, command },
    isPaused: true,
  });
  expect(saving).toMatch(/<fieldset disabled="" class="hours-pause">/);
  expect(render("fr", { isDisabled: true })).toMatch(/<fieldset disabled=""/);
  expect(render("fr", { state: { kind: "unavailable" } })).toContain(
    merchantHours.pauseUnavailable,
  );
  expect(render("fr", { state: { kind: "loading" } })).toContain(merchantHours.pauseLoading);
});
