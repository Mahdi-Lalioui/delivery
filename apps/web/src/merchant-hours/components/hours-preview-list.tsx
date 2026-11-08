import { formatAlgiersDate, formatAlgiersTime } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import type { HoursPreview } from "../hours-http";

type PreviewDay = HoursPreview["days"][number];

const weekdayKeys = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
const dayMs = 86_400_000;

// Africa/Algiers is UTC+01:00 without DST, so local midnight of a civil date is fixed.
function algiersMidnight(date: string): number {
  return Date.parse(`${date}T00:00:00+01:00`);
}

function DayItem({ day, locale }: { day: PreviewDay; locale: Locale }) {
  const translate = useTranslations("merchantHours");
  const midnight = algiersMidnight(day.date);
  const weekday = weekdayKeys[new Date(midnight + dayMs / 2).getUTCDay()] ?? "sunday";
  const heading = translate("previewDay", {
    weekday: translate(`weekdays.${weekday}`),
    date: formatAlgiersDate(midnight + dayMs / 2, locale),
  });
  return (
    <li className="hours-preview-day">
      <h3>{heading}</h3>
      {day.source === "special" ? (
        <p className="hours-badge">{translate("previewSpecial")}</p>
      ) : null}
      {day.maghribAt === null ? null : (
        <p>
          {translate("previewMaghrib", {
            time: formatAlgiersTime(Date.parse(day.maghribAt), locale),
          })}
        </p>
      )}
      {day.intervals.length === 0 ? <p className="hours-closed">{translate("closedDay")}</p> : null}
      <ul className="hours-preview-ranges">
        {day.intervals.map(({ opensAt, closesAt }) => {
          const closes = Date.parse(closesAt);
          const times = {
            opens: formatAlgiersTime(Date.parse(opensAt), locale),
            closes: formatAlgiersTime(closes, locale),
          };
          const isNextDay = closes > midnight + dayMs;
          return (
            <li key={opensAt}>
              <bdi>{translate(isNextDay ? "previewRangeNextDay" : "previewRange", times)}</bdi>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

export function HoursPreviewList({ preview, locale }: { preview: HoursPreview; locale: Locale }) {
  const translate = useTranslations("merchantHours");
  return (
    <section className="hours-preview" aria-labelledby="hours-preview-title">
      <h2 id="hours-preview-title">{translate("previewTitle")}</h2>
      <ol className="hours-preview-days">
        {preview.days.map((day) => (
          <DayItem key={day.date} day={day} locale={locale} />
        ))}
      </ol>
    </section>
  );
}
