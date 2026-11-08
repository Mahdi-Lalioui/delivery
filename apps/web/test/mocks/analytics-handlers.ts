import { adminDashboardTodayOutput, merchantAnalyticsOutput } from "@zaafran/contracts/retention";
import { http, HttpResponse } from "msw";

export const analyticsMerchantId = "019d6abc-0000-7000-8000-000000000002";

export const analyticsFixture = merchantAnalyticsOutput.parse({
  totals: {
    orders: 412,
    salesDzd: 968_400,
    averageTicketDzd: 2350,
    acceptanceRate: 9650,
    avgPrepSeconds: 1140,
    avgDeliverySeconds: 1560,
  },
  cancellations: [
    { reason: "customer_changed_mind", orders: 6 },
    { reason: "restaurant_busy", orders: 3 },
  ],
  topItems: [
    {
      itemId: "019d6abc-0000-7000-8000-000000000701",
      names: { fr: "Couscous royal", ar: "كسكس ملكي" },
      quantity: 120,
      salesDzd: 180_000,
    },
    {
      itemId: "019d6abc-0000-7000-8000-000000000702",
      names: { fr: "=Chorba", ar: "شوربة" },
      quantity: 95,
      salesDzd: 42_750,
    },
  ],
  heatmap: Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 24 }, (_, hour) =>
      hour >= 18 && hour <= 21 ? 10 + day : hour >= 12 && hour <= 14 ? 5 : 0,
    ),
  ),
  repeatCustomerRate: 4100,
});

export const dashboardFixture = adminDashboardTodayOutput.parse({
  totals: {
    orders: 58,
    salesDzd: 131_200,
    averageTicketDzd: 2262,
    acceptanceRate: 9310,
    avgPrepSeconds: 1020,
    avgDeliverySeconds: 1680,
  },
  cancellations: [{ reason: "restaurant_busy", orders: 2 }],
  unresponsiveRestaurants: 1,
  errorRate: 40,
  jobBacklog: 3,
});

export function analyticsHandlers() {
  return [
    http.get("*/v1/merchants/:merchantId/analytics", ({ params, request }) => {
      const url = new URL(request.url);
      if (params.merchantId !== analyticsMerchantId) return new HttpResponse(null, { status: 404 });
      if (url.searchParams.get("from") === null) return new HttpResponse(null, { status: 400 });
      return HttpResponse.json(analyticsFixture);
    }),
    http.get("*/v1/admin/dashboard/today", () => HttpResponse.json(dashboardFixture)),
  ];
}
