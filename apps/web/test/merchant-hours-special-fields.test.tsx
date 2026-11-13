import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import {
  SpecialDatesFields,
  type SpecialDatesFieldsProps,
} from "../src/merchant-hours/components/special-dates-fields";

const drafts = [
  { date: "2026-12-31", ranges: [] },
  { date: "2027-01-01", ranges: [{ opens: "18:00", closes: "02:00" }] },
];

function render(locale: "ar" | "fr", overrides: Partial<SpecialDatesFieldsProps> = {}) {
  const props: SpecialDatesFieldsProps = {
    drafts,
    errors: [],
    isDisabled: false,
    onDateChange: vi.fn(),
    onRangeChange: vi.fn(),
    onAddDate: vi.fn(),
    onRemoveDate: vi.fn(),
    onAddRange: vi.fn(),
    onRemoveRange: vi.fn(),
    ...overrides,
  };
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
      <SpecialDatesFields {...props} />
    </NextIntlClientProvider>,
  );
}

test("[MER-15] labels each special date and shows a closed day or its ranges", () => {
  const { merchantHours } = getMessages("fr");
  const html = render("fr");
  expect(html).toContain(`<legend>${merchantHours.specialLegend}</legend>`);
  expect(html).toContain(`<label for="special-date-0-date">${merchantHours.specialDateLabel}`);
  expect(html).toContain('id="special-date-0-date" type="date" value="2026-12-31"');
  expect(html.match(new RegExp(merchantHours.specialClosed, "g"))).toHaveLength(1);
  expect(html).toContain('id="special-date-1-0-opens" type="time" value="18:00"');
  expect(html).toContain(`<label for="special-date-1-0-closes">${merchantHours.closesLabel}`);
  expect(html.match(new RegExp(merchantHours.overnight, "g"))).toHaveLength(1);
});

test("[MER-15] names the remove buttons with the date in Arabic", () => {
  const html = render("ar");
  expect(html).toContain('aria-label="حذف التاريخ 2026-12-31"');
  expect(html).toContain('aria-label="حذف الفترة 18:00–02:00 بتاريخ 2027-01-01"');
});

test("[MER-15] explains an empty list", () => {
  const { merchantHours } = getMessages("fr");
  const html = render("fr", { drafts: [] });
  expect(html).toContain(merchantHours.specialEmpty);
  expect(html).toContain(`id="special-date-add"`);
});

test.each([
  ["date", "errorDate"],
  ["duplicate", "errorDuplicate"],
  ["time", "errorTime"],
  ["overlap", "errorOverlap"],
] as const)("[MER-15] shows the %s error on its own special date", (reason, key) => {
  const { merchantHours } = getMessages("ar");
  const html = render("ar", { errors: [{ index: 1, reason }] });
  expect(html).toContain(`id="special-date-1-error" role="alert">${merchantHours[key]}</p>`);
  expect(html).toContain('aria-describedby="special-date-1-error"');
  expect(html).not.toContain("special-date-0-error");
});

test("[MER-15] disables adding at the limits and every control while saving", () => {
  const full = [
    {
      date: "2027-01-01",
      ranges: [0, 1, 2, 3].map((slot) => ({ opens: `0${String(slot)}:00`, closes: "09:00" })),
    },
  ];
  expect(render("fr", { drafts: full })).toMatch(
    /<button[^>]*id="special-date-0-add"[^>]*disabled=""/,
  );
  const atLimit = Array.from({ length: 60 }, () => ({ date: "2027-01-01", ranges: [] }));
  expect(render("fr", { drafts: atLimit })).toMatch(
    /<button[^>]*id="special-date-add"[^>]*disabled=""/,
  );
  expect(render("fr", { isDisabled: true })).toContain("<fieldset disabled=");
});
