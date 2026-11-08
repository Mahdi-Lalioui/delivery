import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import {
  RamadanFields,
  type RamadanFieldsProps,
} from "../src/merchant-hours/components/ramadan-fields";
import { toRamadanDraft } from "../src/merchant-hours/ramadan-editor";

const emptyWeek = Array.from({ length: 7 }, (_, weekday) => ({ weekday, ranges: [] }));
const draft = toRamadanDraft({
  weekly: emptyWeek.map((day) =>
    day.weekday === 2
      ? {
          weekday: 2,
          ranges: [
            {
              opens: { kind: "maghrib", minutes: -60 },
              closes: { kind: "clock", minuteOfDay: 120 },
            },
          ],
        }
      : day,
  ),
  suhoor: { opensMinute: 180, closesMinute: 270 },
  method: "Algeria",
  adjustmentMinutes: 2,
});

function render(locale: "ar" | "fr", overrides: Partial<RamadanFieldsProps> = {}) {
  const props: RamadanFieldsProps = {
    draft,
    errors: [],
    isDisabled: false,
    onEdit: vi.fn(),
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
      <RamadanFields {...props} />
    </NextIntlClientProvider>,
  );
}

test("[MER-16] renders a Maghrib-relative opening and a clock closing with labelled controls", () => {
  const { merchantHours } = getMessages("fr");
  const html = render("fr");
  expect(html).toContain(merchantHours.ramadanLegend);
  expect(html).toMatch(/id="ramadan-2-0-opens-kind"[^>]*>/);
  expect(html).toContain('<label for="ramadan-2-0-opens-offset">');
  expect(html).toMatch(/id="ramadan-2-0-opens-offset"[^>]*value="-60"/);
  expect(html).toMatch(/id="ramadan-2-0-closes-time" type="time" value="02:00"/);
  expect(html).not.toContain('id="ramadan-2-0-opens-time"');
  expect(html).toContain(`<option value="maghrib" selected="">${merchantHours.kindMaghrib}`);
  expect(html.match(new RegExp(merchantHours.closedDay, "g"))).toHaveLength(6);
});

test("[MER-16] shows the suhoor window, prayer method and adjustment in Arabic", () => {
  const { merchantHours } = getMessages("ar");
  const html = render("ar");
  expect(html).toContain(merchantHours.suhoorToggle);
  expect(html).toMatch(/id="ramadan-suhoor-on" type="checkbox" checked=""/);
  expect(html).toMatch(/id="ramadan-suhoor-opens" type="time" value="03:00"/);
  expect(html).toContain(`<option value="Algeria" selected="">${merchantHours.methods.Algeria}`);
  expect(html.match(/<option value="[A-Za-z]+"/g)?.length).toBeGreaterThanOrEqual(13);
  expect(html).toMatch(/id="ramadan-adjustment"[^>]*value="2"/);
  const off = render("ar", { draft: { ...draft, suhoor: null } });
  expect(off).not.toContain('id="ramadan-suhoor-opens"');
});

test("[MER-16] links day, suhoor and adjustment errors and disables the whole schedule", () => {
  const { merchantHours } = getMessages("fr");
  const html = render("fr", {
    errors: [{ field: "day", weekday: 2 }, { field: "suhoor" }, { field: "adjustment" }],
    isDisabled: true,
  });
  expect(html).toContain(`id="ramadan-2-error" role="alert">${merchantHours.errorRamadanDay}`);
  expect(html).toContain('aria-describedby="ramadan-2-error"');
  expect(html).toContain(`id="ramadan-suhoor-error" role="alert">${merchantHours.errorSuhoor}`);
  expect(html).toMatch(/id="ramadan-adjustment"[^>]*aria-describedby="ramadan-adjustment-error"/);
  expect(html).toContain("<fieldset disabled=");
});

test("[MER-16] names the remove action with the day and both endpoints", () => {
  const html = render("fr");
  expect(html).toContain('aria-label="Retirer le créneau Maghrib −60–02:00 (Mardi)"');
  expect(html).toMatch(/id="ramadan-2-add"/);
});
