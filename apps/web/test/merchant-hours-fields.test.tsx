import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import {
  WeeklyHoursFields,
  type WeeklyHoursFieldsProps,
} from "../src/merchant-hours/components/weekly-hours-fields";
import { toHoursDraft } from "../src/merchant-hours/hours-editor";

const emptyWeek = Array.from({ length: 7 }, (_, weekday) => ({ weekday, ranges: [] }));
const draft = toHoursDraft({
  weekly: emptyWeek.map((day) =>
    day.weekday === 1
      ? {
          weekday: 1,
          ranges: [
            { opensMinute: 690, closesMinute: 900 },
            { opensMinute: 1080, closesMinute: 120 },
          ],
        }
      : day,
  ),
  specialDates: [],
});

function render(locale: "ar" | "fr", overrides: Partial<WeeklyHoursFieldsProps> = {}) {
  const props: WeeklyHoursFieldsProps = {
    draft,
    errors: [],
    isDisabled: false,
    onChange: vi.fn(),
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
      <WeeklyHoursFields {...props} />
    </NextIntlClientProvider>,
  );
}

test("[MER-15] lists the seven weekdays from Sunday with localized names", () => {
  const { merchantHours } = getMessages("ar");
  const html = render("ar");
  const positions = Object.values(merchantHours.weekdays).map((name) =>
    html.indexOf(`<legend>${name}</legend>`),
  );
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  expect(html.match(/>مغلق</g)).toHaveLength(6);
});

test("[MER-15] labels each time input and marks the overnight range in French", () => {
  const { merchantHours } = getMessages("fr");
  const html = render("fr");
  expect(html).toContain('id="hours-1-0-opens" type="time" value="11:30"');
  expect(html).toContain('<label for="hours-1-1-closes">' + merchantHours.closesLabel + "</label>");
  expect(html.match(new RegExp(merchantHours.overnight, "g"))).toHaveLength(1);
  expect(html).toContain('aria-label="Retirer le créneau 18:00–02:00 (Lundi)"');
});

test("[MER-15] shows the weekday error and disables add at four ranges", () => {
  const { merchantHours } = getMessages("ar");
  const full = toHoursDraft({
    weekly: emptyWeek.map((day) =>
      day.weekday === 2
        ? {
            weekday: 2,
            ranges: [0, 1, 2, 3].map((slot) => ({
              opensMinute: slot * 120,
              closesMinute: slot * 120 + 60,
            })),
          }
        : day,
    ),
    specialDates: [],
  });
  const html = render("ar", { draft: full, errors: [{ weekday: 2, reason: "overlap" }] });
  expect(html).toContain(`id="hours-2-error" role="alert">${merchantHours.errorOverlap}</p>`);
  expect(html).toContain('aria-describedby="hours-2-error"');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*<\/button>/);
  expect(html).toMatch(/<button[^>]*id="hours-2-add"[^>]*disabled=""/);
});

test("[MER-15] disables every control while saving", () => {
  const html = render("ar", { isDisabled: true });
  expect(html).toContain("<fieldset disabled=");
});
