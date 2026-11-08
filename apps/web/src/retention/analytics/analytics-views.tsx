"use client";

import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  KpiTile,
  PageHeader,
  SegmentedControl,
  Skeleton,
} from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { CancellationBars, OrdersHeatmap, TotalsTiles } from "./analytics-charts";
import { analyticsCsv, type DashboardToday, type MerchantAnalytics } from "./analytics-http";
import {
  useDashboardToday,
  useMerchantAnalytics,
  type MerchantAnalyticsState,
  type RangeDays,
} from "./use-analytics";

type Names = MerchantAnalytics["topItems"][number]["names"];

function itemName(names: Names, locale: Locale): string {
  const key = locale === "ar" || locale === "en" ? locale : "fr";
  return names[key] ?? names.fr ?? names.ar ?? names.en ?? "";
}

function percent(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(1).replace(/\.0$/, "")} %`;
}

function useCsvDownload(analytics: MerchantAnalytics, locale: Locale) {
  const translate = useTranslations("retentionAnalytics");
  return () => {
    const labels = {
      metric: translate("csvMetric"),
      value: translate("csvValue"),
      item: translate("dish"),
      quantity: translate("quantity"),
      sales: translate("sales"),
      reason: translate("reason"),
      orders: translate("orders"),
    };
    const blob = new Blob([analyticsCsv(analytics, labels, (names) => itemName(names, locale))], {
      type: "text/csv;charset=utf-8",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = translate("csvFile");
    link.click();
    URL.revokeObjectURL(link.href);
  };
}

function TopItems({ analytics, locale }: { analytics: MerchantAnalytics; locale: Locale }) {
  const translate = useTranslations("retentionAnalytics");
  if (analytics.topItems.length === 0)
    return <EmptyState icon="plate" title={translate("noItems")} />;
  return (
    <table className="analytics-table">
      <thead>
        <tr>
          <th scope="col">{translate("dish")}</th>
          <th scope="col">{translate("quantity")}</th>
          <th scope="col">{translate("sales")}</th>
        </tr>
      </thead>
      <tbody>
        {analytics.topItems.map((item) => (
          <tr key={item.itemId}>
            <th scope="row">{itemName(item.names, locale)}</th>
            <td>{item.quantity}</td>
            <td>
              <bdi>{formatDzd(item.salesDzd, locale)}</bdi>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AnalyticsReady({ analytics, locale }: { analytics: MerchantAnalytics; locale: Locale }) {
  const translate = useTranslations("retentionAnalytics");
  const download = useCsvDownload(analytics, locale);
  return (
    <div className="billing-layout">
      <TotalsTiles totals={analytics.totals} locale={locale}>
        <KpiTile
          label={translate("repeatCustomers")}
          value={<bdi>{percent(analytics.repeatCustomerRate)}</bdi>}
          detail={translate("repeatCustomersHint")}
        />
      </TotalsTiles>
      <Card title={translate("heatmap")} titleId="analytics-heatmap">
        <OrdersHeatmap heatmap={analytics.heatmap} />
      </Card>
      <div className="billing-two-columns">
        <Card title={translate("topItems")} titleId="analytics-top">
          <TopItems analytics={analytics} locale={locale} />
        </Card>
        <Card title={translate("cancellations")} titleId="analytics-cancellations">
          <CancellationBars rows={analytics.cancellations} />
        </Card>
      </div>
      <div>
        <Button variant="secondary" icon="download" onClick={download}>
          {translate("exportCsv")}
        </Button>
      </div>
    </div>
  );
}

const failureKeys = {
  "sign-in": "signInRequired",
  "not-found": "notFound",
  invalid: "loadError",
  error: "loadError",
} as const;

/** MER-21 view (page and design gallery). */
export function MerchantAnalyticsView({
  state,
  locale,
}: {
  state: MerchantAnalyticsState;
  locale: Locale;
}) {
  const translate = useTranslations("retentionAnalytics");
  const ranges: { value: RangeDays; label: string }[] = [
    { value: "7", label: translate("range", { count: 7 }) },
    { value: "30", label: translate("range", { count: 30 }) },
    { value: "90", label: translate("range", { count: 90 }) },
  ];
  const { view } = state;
  return (
    <section className="billing-page" aria-labelledby="analytics-title">
      <PageHeader
        title={translate("title")}
        intro={translate("intro")}
        titleId="analytics-title"
        action={
          <SegmentedControl
            legend={translate("period")}
            isLegendVisible={false}
            name="analytics-range"
            value={state.range}
            options={ranges}
            onChange={state.setRange}
          />
        }
      />
      {view.kind === "loading" && <Skeleton label={translate("loading")} lines={8} />}
      {view.kind === "ready" && <AnalyticsReady analytics={view.analytics} locale={locale} />}
      {view.kind !== "loading" && view.kind !== "ready" && (
        <ErrorState
          title={translate(failureKeys[view.kind])}
          {...(view.kind === "error" && { retryLabel: translate("retry"), onRetry: state.retry })}
        />
      )}
    </section>
  );
}

export function MerchantAnalytics({ merchantId, locale }: { merchantId: string; locale: Locale }) {
  return <MerchantAnalyticsView state={useMerchantAnalytics(merchantId)} locale={locale} />;
}

function Health({ dashboard }: { dashboard: DashboardToday }) {
  const translate = useTranslations("retentionAnalytics");
  const errorTone =
    dashboard.errorRate >= 200 ? "danger" : dashboard.errorRate >= 50 ? "warning" : "success";
  return (
    <div className="billing-kpis">
      <KpiTile
        label={translate("unresponsive")}
        value={dashboard.unresponsiveRestaurants}
        detail={
          <Badge tone={dashboard.unresponsiveRestaurants > 0 ? "warning" : "success"}>
            {translate(dashboard.unresponsiveRestaurants > 0 ? "needsAttention" : "allGood")}
          </Badge>
        }
      />
      <KpiTile
        label={translate("errorRate")}
        value={<bdi>{percent(dashboard.errorRate)}</bdi>}
        detail={
          <Badge tone={errorTone}>
            {translate(errorTone === "success" ? "allGood" : "needsAttention")}
          </Badge>
        }
      />
      <KpiTile label={translate("jobBacklog")} value={dashboard.jobBacklog} />
    </div>
  );
}

/** ADM-02 view (page and design gallery). The live map follows with lane A's tracking. */
export function AdminDashboardView({
  state,
  locale,
}: {
  state: ReturnType<typeof useDashboardToday>;
  locale: Locale;
}) {
  const translate = useTranslations("retentionAnalytics");
  const { view } = state;
  return (
    <section className="billing-page" aria-labelledby="dashboard-title">
      <PageHeader
        title={translate("dashboardTitle")}
        intro={translate("dashboardIntro")}
        titleId="dashboard-title"
      />
      {view.kind === "loading" && <Skeleton label={translate("loading")} lines={6} />}
      {view.kind === "ready" && (
        <div className="billing-layout">
          <Health dashboard={view.dashboard} />
          <TotalsTiles totals={view.dashboard.totals} locale={locale} />
          <Card title={translate("cancellations")} titleId="dashboard-cancellations">
            <CancellationBars rows={view.dashboard.cancellations} />
          </Card>
        </div>
      )}
      {view.kind !== "loading" && view.kind !== "ready" && (
        <ErrorState
          title={translate(failureKeys[view.kind])}
          {...(view.kind === "error" && { retryLabel: translate("retry"), onRetry: state.retry })}
        />
      )}
    </section>
  );
}

export function AdminDashboard({ locale }: { locale: Locale }) {
  return <AdminDashboardView state={useDashboardToday()} locale={locale} />;
}
