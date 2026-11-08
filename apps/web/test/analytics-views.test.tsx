import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import {
  AdminDashboardView,
  MerchantAnalyticsView,
} from "../src/retention/analytics/analytics-views";
import { analyticsFixture, dashboardFixture } from "./mocks/analytics-handlers";

type Locale = "ar" | "fr" | "en";

function wrap(node: ReactNode, locale: Locale) {
  const { retentionAnalytics } = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={{ retentionAnalytics }}
      timeZone="Africa/Algiers"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

const ready = {
  view: { kind: "ready" as const, analytics: analyticsFixture },
  range: "30" as const,
  setRange: vi.fn(),
  retry: vi.fn(),
};

test("[MER-21] shows KPI tiles, a 7×24 heatmap with tooltips, top dishes, cancellations and CSV export", () => {
  const html = wrap(<MerchantAnalyticsView state={ready} locale="fr" />, "fr");
  const { retentionAnalytics } = getMessages("fr");
  expect(html.match(/class="ui-kpi"/g)?.length).toBeGreaterThanOrEqual(7);
  expect(html).toContain("968 400 DA");
  expect(html).toContain("96.5 %");
  expect(html.match(/class="analytics-cell"/g)).toHaveLength(168);
  expect(html).toContain("<title>");
  expect(html).toContain("Couscous royal");
  expect(html).toContain(retentionAnalytics.reason_restaurant_busy);
  expect(html).toContain(retentionAnalytics.exportCsv);
  expect(html).toContain("ui-segmented");
});

test("[MER-21] has loading, error and not-found states", () => {
  const { retentionAnalytics } = getMessages("ar");
  expect(
    wrap(
      <MerchantAnalyticsView state={{ ...ready, view: { kind: "loading" } }} locale="ar" />,
      "ar",
    ),
  ).toContain('class="ui-skeleton"');
  expect(
    wrap(<MerchantAnalyticsView state={{ ...ready, view: { kind: "error" } }} locale="ar" />, "ar"),
  ).toContain(retentionAnalytics.retry);
  expect(
    wrap(
      <MerchantAnalyticsView state={{ ...ready, view: { kind: "not-found" } }} locale="ar" />,
      "ar",
    ),
  ).toContain(retentionAnalytics.notFound);
});

test("[ADM-02] shows today's totals and health with status badges", () => {
  const html = wrap(
    <AdminDashboardView
      state={{ view: { kind: "ready", dashboard: dashboardFixture }, retry: vi.fn() }}
      locale="en"
    />,
    "en",
  );
  const { retentionAnalytics } = getMessages("en");
  expect(html).toContain(retentionAnalytics.unresponsive);
  expect(html).toContain("ui-badge-warning");
  expect(html).toContain("0.4 %");
  expect(html).toContain("131 200 DA");
});
