import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import {
  analyticsCsv,
  loadDashboardToday,
  loadMerchantAnalytics,
  rangeEndingToday,
} from "../src/retention/analytics/analytics-http";
import {
  analyticsFixture,
  analyticsHandlers,
  analyticsMerchantId,
} from "./mocks/analytics-handlers";

const server = setupServer();
beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});
beforeEach(() => {
  server.resetHandlers(...analyticsHandlers());
  const interceptedFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) =>
    interceptedFetch(new URL(input, "http://app.test"), init),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(() => {
  server.close();
});

test("[MER-21] loads analytics for a valid Algiers date range and rejects an inverted one", async () => {
  expect(
    await loadMerchantAnalytics({
      merchantId: analyticsMerchantId,
      from: "2027-02-01",
      to: "2027-02-28",
    }),
  ).toMatchObject({ kind: "ready", analytics: { totals: { orders: 412 } } });
  expect(
    await loadMerchantAnalytics({
      merchantId: analyticsMerchantId,
      from: "2027-03-01",
      to: "2027-02-01",
    }),
  ).toEqual({ kind: "invalid" });
});

test("[MER-21] computes calendar ranges in Africa/Algiers", () => {
  // 23:30 UTC on 9 Feb is already 10 Feb in Algiers (UTC+1).
  expect(rangeEndingToday(7, Date.parse("2027-02-09T23:30:00Z"))).toEqual({
    from: "2027-02-04",
    to: "2027-02-10",
  });
});

test("[MER-21] exports CSV with a BOM, quoted cells and neutralised formulas", () => {
  const labels = {
    metric: "Indicateur",
    value: "Valeur",
    item: "Plat",
    quantity: "Quantité",
    sales: "Ventes",
    reason: "Motif",
    orders: "Commandes",
  };
  const csv = analyticsCsv(analyticsFixture, labels, (names) => names.fr ?? "");
  expect(csv.startsWith('﻿"Indicateur","Valeur"')).toBe(true);
  expect(csv).toContain('"Couscous royal","120","180000"');
  expect(csv).toContain(`"'=Chorba"`);
  expect(csv).toContain('"restaurant_busy","3"');
});

test("[ADM-02] loads today's dashboard", async () => {
  expect(await loadDashboardToday()).toMatchObject({
    kind: "ready",
    dashboard: { totals: { orders: 58 }, jobBacklog: 3 },
  });
});
