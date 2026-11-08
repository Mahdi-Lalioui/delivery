"use client";

import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { KpiTile } from "@zaafran/ui";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { MerchantAnalytics } from "./analytics-http";

type Totals = MerchantAnalytics["totals"];
type Cancellations = MerchantAnalytics["cancellations"];

const heatSteps = 5;
const cell = 18;
const gap = 2;
const labelWidth = 40;
const labelHeight = 18;

function percent(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(1).replace(/\.0$/, "")} %`;
}

function minutes(seconds: number): number {
  return Math.round(seconds / 60);
}

/** MER-21 / ADM-02 headline numbers as stat tiles (the right form for single values). */
export function TotalsTiles({
  totals,
  locale,
  children,
}: {
  totals: Totals;
  locale: Locale;
  children?: ReactNode;
}) {
  const translate = useTranslations("retentionAnalytics");
  return (
    <div className="billing-kpis">
      <KpiTile label={translate("orders")} value={totals.orders} />
      <KpiTile label={translate("sales")} value={<bdi>{formatDzd(totals.salesDzd, locale)}</bdi>} />
      <KpiTile
        label={translate("averageTicket")}
        value={<bdi>{formatDzd(totals.averageTicketDzd, locale)}</bdi>}
      />
      <KpiTile
        label={translate("acceptanceRate")}
        value={<bdi>{percent(totals.acceptanceRate)}</bdi>}
      />
      <KpiTile
        label={translate("avgPrep")}
        value={translate("minutes", { count: minutes(totals.avgPrepSeconds) })}
      />
      <KpiTile
        label={translate("avgDelivery")}
        value={translate("minutes", { count: minutes(totals.avgDeliverySeconds) })}
      />
      {children}
    </div>
  );
}

const reasonKeys: Readonly<
  Record<string, "reason_customer_changed_mind" | "reason_restaurant_busy">
> = {
  customer_changed_mind: "reason_customer_changed_mind",
  restaurant_busy: "reason_restaurant_busy",
};

/** Known reason codes are translated; anything new from the API is shown as sent. */
function reasonLabel(
  reason: string,
  translate: (key: "reason_customer_changed_mind" | "reason_restaurant_busy") => string,
): string {
  const key = reasonKeys[reason];
  return key === undefined ? reason : translate(key);
}

/** Cancellations by reason: one series, so no legend; values in text ink beside each bar. */
export function CancellationBars({ rows }: { rows: Cancellations }) {
  const translate = useTranslations("retentionAnalytics");
  if (rows.length === 0) return <p className="ui-field-hint">{translate("noCancellations")}</p>;
  const max = Math.max(...rows.map((row) => row.orders), 1);
  return (
    <ul className="analytics-bars">
      {rows.map((row) => (
        <li key={row.reason}>
          <span className="analytics-bar-label">{reasonLabel(row.reason, translate)}</span>
          <svg
            className="analytics-bar-track"
            viewBox="0 0 100 8"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <rect
              className="analytics-bar-fill"
              x={0}
              y={0}
              height={8}
              rx={4}
              width={Math.max(2, (row.orders / max) * 100)}
            />
          </svg>
          <span className="analytics-bar-value">{row.orders}</span>
        </li>
      ))}
    </ul>
  );
}

/** Weekday × hour heatmap: one sequential hue in five steps; each cell has a native tooltip. */
export function OrdersHeatmap({ heatmap }: { heatmap: MerchantAnalytics["heatmap"] }) {
  const translate = useTranslations("retentionAnalytics");
  const format = useFormatter();
  const max = Math.max(...heatmap.flat(), 1);
  // 4 Jan 2027 is a Monday; rows are Monday → Sunday as the API sends them.
  const dayName = (day: number) =>
    format.dateTime(new Date(Date.UTC(2027, 0, 4 + day, 12)), {
      weekday: "short",
      timeZone: "UTC",
    });
  const width = labelWidth + 24 * (cell + gap);
  const height = labelHeight + 7 * (cell + gap);
  return (
    <div className="analytics-heatmap" dir="ltr">
      <svg
        viewBox={`0 0 ${String(width)} ${String(height)}`}
        role="img"
        aria-label={translate("heatmapLabel")}
      >
        {[0, 6, 12, 18].map((hour) => (
          <text
            key={hour}
            className="analytics-axis"
            fontSize={9}
            x={labelWidth + hour * (cell + gap)}
            y={12}
          >
            {translate("hour", { hour })}
          </text>
        ))}
        {heatmap.map((hours, day) => (
          <g key={day}>
            <text
              className="analytics-axis"
              fontSize={9}
              x={0}
              y={labelHeight + day * (cell + gap) + 13}
            >
              {dayName(day)}
            </text>
            {hours.map((orders, hour) => {
              const step = orders === 0 ? 0 : Math.ceil((orders / max) * heatSteps);
              return (
                <rect
                  key={hour}
                  className="analytics-cell"
                  data-step={step}
                  x={labelWidth + hour * (cell + gap)}
                  y={labelHeight + day * (cell + gap)}
                  width={cell}
                  height={cell}
                  rx={3}
                >
                  <title>
                    {translate("cellTooltip", { day: dayName(day), hour, count: orders })}
                  </title>
                </rect>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}
