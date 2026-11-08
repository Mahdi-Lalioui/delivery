import { getMessages } from "@zaafran/i18n/messages";
import { formatAlgiersDate } from "@zaafran/i18n/formats";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { HoursPreviewList } from "../src/merchant-hours/components/hours-preview-list";
import type { HoursPreview } from "../src/merchant-hours/hours-http";

const dates = ["08", "09", "10", "11", "12", "13", "14"].map((day) => "2027-02-" + day);
const preview: HoursPreview = {
  schedule: "ramadan",
  days: dates.map((date) => ({ date, source: "weekly", maghribAt: null, intervals: [] })),
};
const days = [...preview.days];
days[0] = {
  date: "2027-02-08",
  source: "ramadan",
  maghribAt: "2027-02-08T17:23:00.000Z",
  intervals: [
    { opensAt: "2027-02-08T02:00:00.000Z", closesAt: "2027-02-08T03:30:00.000Z" },
    { opensAt: "2027-02-08T16:23:00.000Z", closesAt: "2027-02-09T01:00:00.000Z" },
  ],
};
days[1] = {
  date: "2027-02-09",
  source: "special",
  maghribAt: null,
  intervals: [{ opensAt: "2027-02-09T17:00:00.000Z", closesAt: "2027-02-09T23:00:00.000Z" }],
};
const filled = { ...preview, days };

function render(locale: "ar" | "fr") {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={getMessages(locale)}
      timeZone="Africa/Algiers"
    >
      <HoursPreviewList preview={filled} locale={locale} />
    </NextIntlClientProvider>,
  );
}

test("[MER-16] lists seven dated days with Algiers times and the next-day mark", () => {
  const { merchantHours } = getMessages("fr");
  const html = render("fr");
  expect(html.match(/<li class="hours-preview-day"/g)).toHaveLength(7);
  const heading = `${merchantHours.weekdays.monday} ${formatAlgiersDate(Date.parse("2027-02-08T12:00:00+01:00"), "fr")}`;
  expect(html).toContain(`<h3>${heading}</h3>`);
  expect(html).toContain("03:00–04:30");
  expect(html).toContain(
    merchantHours.previewRangeNextDay.replace("{opens}", "17:23").replace("{closes}", "02:00"),
  );
  expect(html).toContain(merchantHours.previewMaghrib.replace("{time}", "18:23"));
  expect(html).toContain(merchantHours.previewSpecial);
  expect(html).toContain("18:00–00:00");
  expect(html.match(new RegExp(`>${merchantHours.closedDay}<`, "g"))).toHaveLength(5);
});

test("[MER-16] renders the Arabic preview with Latin digits", () => {
  const { merchantHours } = getMessages("ar");
  const html = render("ar");
  expect(html).toContain(merchantHours.weekdays.monday);
  expect(html).toContain("17:23–02:00");
  expect(html).not.toMatch(/[٠-٩]/);
});
