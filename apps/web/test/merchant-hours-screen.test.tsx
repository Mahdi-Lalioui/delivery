import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { MerchantHoursScreen } from "../src/merchant-hours/components/merchant-hours-screen";
import { toHoursDraft } from "../src/merchant-hours/hours-editor";
import { useHoursEditor, type MerchantHoursEditor } from "../src/merchant-hours/use-hours-editor";

vi.mock("../src/merchant-hours/use-hours-editor", () => ({ useHoursEditor: vi.fn() }));

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const emptyWeek = Array.from({ length: 7 }, (_, weekday) => ({ weekday, ranges: [] }));
const draft = toHoursDraft({
  weekly: emptyWeek.map((day) =>
    day.weekday === 4 ? { weekday: 4, ranges: [{ opensMinute: 1080, closesMinute: 120 }] } : day,
  ),
  specialDates: [],
});
const dates = ["08", "09", "10", "11", "12", "13", "14"].map((day) => "2026-11-" + day);
const preview = {
  schedule: "regular" as const,
  days: dates.map((date) => ({ date, source: "weekly" as const, maghribAt: null, intervals: [] })),
};
const controls: MerchantHoursEditor = {
  state: { kind: "editing", sessionId, revision: 2, draft, errors: [] },
  preview: { kind: "ready", data: preview },
  pause: {
    state: { kind: "ready", pausedUntil: null },
    isPaused: false,
    close: vi.fn(),
    reopen: vi.fn(),
    retry: vi.fn(),
  },
  focus: undefined,
  change: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  save: vi.fn(),
  reload: vi.fn(),
};

function render(locale: "ar" | "fr", override: Partial<MerchantHoursEditor> = {}) {
  vi.mocked(useHoursEditor).mockReturnValue({ ...controls, ...override });
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      timeZone="Africa/Algiers"
      messages={{ merchantHours: getMessages(locale).merchantHours }}
    >
      <MerchantHoursScreen merchantId={merchantId} locale={locale} />
    </NextIntlClientProvider>,
  );
}

test("[MER-15] shows the weekly editor, save action and seven-day preview in Arabic", () => {
  const { merchantHours } = getMessages("ar");
  const html = render("ar");
  expect(html).toContain(merchantHours.title);
  expect(html).toContain(merchantHours.weeklyLegend);
  expect(html).toContain('id="hours-4-0-opens" type="time" value="18:00"');
  expect(html).toContain(merchantHours.overnight);
  expect(html).toContain(merchantHours.save);
  expect(html).toContain(merchantHours.previewTitle);
  expect(html.match(/class="hours-preview-day"/g)).toHaveLength(7);
  expect(html.match(/id="hours-preview-title"/g)).toHaveLength(1);
  expect(html).toContain('href="/ar/merchant"');
});

test("[MER-15] disables the week and announces saving while a save is in flight", () => {
  const { merchantHours } = getMessages("fr");
  const html = render("fr", {
    state: {
      kind: "saving",
      sessionId,
      revision: 2,
      draft,
      errors: [],
      idempotencyKey: "key-1",
    },
  });
  expect(html).toMatch(/<fieldset disabled="" class="hours-week">/);
  expect(html).toContain(merchantHours.saving);
});

test.each([
  ["saved", { notice: "saved" as const }],
  ["rateLimited", { failure: "rate-limited" as const }],
  ["invalidHours", { failure: "invalid-hours" as const }],
  ["saveError", { failure: "error" as const }],
] as const)("[MER-15] maps the %s save outcome to a localized message", (key, outcome) => {
  const { merchantHours } = getMessages("fr");
  const html = render("fr", {
    state: { kind: "editing", sessionId, revision: 2, draft, errors: [], ...outcome },
  });
  expect(html).toContain(merchantHours[key]);
});

test.each([
  ["revision-conflict", "revisionConflict"],
  ["session-changed", "sessionChanged"],
] as const)("[MER-15] offers a reload after a %s save failure", (failure, key) => {
  const { merchantHours } = getMessages("ar");
  const html = render("ar", {
    state: { kind: "editing", sessionId, revision: 2, draft, errors: [], failure },
  });
  expect(html).toContain(merchantHours[key]);
  expect(html).toContain("data-hours-reload");
});

test.each([
  ["loading", "loading"],
  ["forbidden", "forbidden"],
  ["error", "loadError"],
  ["sign-in", "signInRequired"],
] as const)("[MER-15] gates the %s load state", (kind, key) => {
  const { merchantHours } = getMessages("fr");
  const state = kind === "loading" ? { kind } : { kind: "load-failed" as const, failure: kind };
  const html = render("fr", { state });
  expect(html).toContain(merchantHours[key]);
  expect(html).not.toContain(merchantHours.weeklyLegend);
});

test("[MER-15] reports a preview that could not load without hiding the editor", () => {
  const { merchantHours } = getMessages("fr");
  const html = render("fr", { preview: { kind: "error" } });
  expect(html).toContain(merchantHours.previewError);
  expect(html.match(/id="hours-preview-title"/g)).toHaveLength(1);
  expect(html).toContain(merchantHours.weeklyLegend);
});

test("[MER-15] places the closed-now control beside the week and locks both while it saves", () => {
  const { merchantHours } = getMessages("fr");
  expect(render("fr")).toContain(merchantHours.pauseFor30);
  const command = { idempotencyKey: "key-1", input: { pausedUntil: null, expectedRevision: 2 } };
  const html = render("fr", {
    pause: { ...controls.pause, state: { kind: "saving", pausedUntil: null, command } },
  });
  expect(html).toMatch(/<fieldset disabled="" class="hours-week">/);
  expect(html).toMatch(/<fieldset disabled="" class="hours-pause">/);
  expect(html).toMatch(/<button[^>]*data-hours-save="true"[^>]*disabled=""/);
});
