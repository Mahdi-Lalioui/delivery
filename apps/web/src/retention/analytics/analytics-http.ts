import {
  adminDashboardTodayOutput,
  merchantAnalyticsOutput,
  merchantAnalyticsQuery,
} from "@zaafran/contracts/retention";

// MER-21 / ADM-02 analytics clients on lane A's retention contract (MSW until orders are stored).

export type MerchantAnalytics = ReturnType<typeof merchantAnalyticsOutput.parse>;
export type DashboardToday = ReturnType<typeof adminDashboardTodayOutput.parse>;
type Failure = { kind: "sign-in" | "not-found" | "invalid" | "error" };
export type AnalyticsLoad = { kind: "ready"; analytics: MerchantAnalytics } | Failure;
export type DashboardLoad = { kind: "ready"; dashboard: DashboardToday } | Failure;

const requestOptions = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;

async function getJson(
  path: string,
  signal?: AbortSignal,
): Promise<{ kind: "ok"; body: unknown } | Failure> {
  try {
    const response = await fetch(path, { ...requestOptions, ...(signal && { signal }) });
    if (response.status === 401 || response.status === 403) return { kind: "sign-in" };
    if (response.status === 404) return { kind: "not-found" };
    if (!response.ok) return { kind: "error" };
    return { kind: "ok", body: await response.json() };
  } catch {
    return { kind: "error" };
  }
}

/** MER-21: totals, cancellations, top items, weekday × hour heatmap and repeat customers. */
export async function loadMerchantAnalytics(input: {
  merchantId: string;
  from: string;
  to: string;
  signal?: AbortSignal | undefined;
}): Promise<AnalyticsLoad> {
  const query = merchantAnalyticsQuery.safeParse({ from: input.from, to: input.to });
  if (!query.success) return { kind: "invalid" };
  const path = `/v1/merchants/${encodeURIComponent(input.merchantId)}/analytics?${new URLSearchParams(query.data).toString()}`;
  const result = await getJson(path, input.signal);
  if (result.kind !== "ok") return result;
  const output = merchantAnalyticsOutput.safeParse(result.body);
  return output.success ? { kind: "ready", analytics: output.data } : { kind: "error" };
}

/** ADM-02: today's platform totals and health. */
export async function loadDashboardToday(signal?: AbortSignal): Promise<DashboardLoad> {
  const result = await getJson("/v1/admin/dashboard/today", signal);
  if (result.kind !== "ok") return result;
  const output = adminDashboardTodayOutput.safeParse(result.body);
  return output.success ? { kind: "ready", dashboard: output.data } : { kind: "error" };
}

/** Calendar days in Africa/Algiers: the last `days` days ending today. */
export function rangeEndingToday(days: number, nowMs: number): { from: string; to: string } {
  const algiers = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dayMs = 86_400_000;
  return { from: algiers.format(nowMs - (days - 1) * dayMs), to: algiers.format(nowMs) };
}

const byteOrderMark = "\uFEFF";

function csvCell(value: string | number): string {
  const text = String(value);
  // Quote everything and neutralise spreadsheet formulas (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** MER-21 CSV export: one section per table, UTF-8 with BOM so Excel shows Arabic correctly. */
export function analyticsCsv(
  analytics: MerchantAnalytics,
  labels: {
    metric: string;
    value: string;
    item: string;
    quantity: string;
    sales: string;
    reason: string;
    orders: string;
  },
  itemName: (names: MerchantAnalytics["topItems"][number]["names"]) => string,
): string {
  const rows: (string | number)[][] = [
    [labels.metric, labels.value],
    ...Object.entries(analytics.totals).map(([key, value]) => [key, value]),
    ["repeatCustomerRate", analytics.repeatCustomerRate],
    [],
    [labels.item, labels.quantity, labels.sales],
    ...analytics.topItems.map((item) => [itemName(item.names), item.quantity, item.salesDzd]),
    [],
    [labels.reason, labels.orders],
    ...analytics.cancellations.map((row) => [row.reason, row.orders]),
  ];
  return `${byteOrderMark}${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
