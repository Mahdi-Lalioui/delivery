import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import {
  draftToInput,
  loadBillingSettings,
  saveBillingSettings,
  settingsToDraft,
} from "../src/admin/billing/billing-settings-http";
import { billingMockIds as ids } from "./mocks/admin-billing-handlers";
import { billingSettingsHandlers } from "./mocks/billing-settings-handlers";

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});
beforeEach(() => {
  server.resetHandlers(...billingSettingsHandlers());
  const interceptedFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) =>
    interceptedFetch(new URL(input, "http://admin.test"), init),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(() => {
  server.close();
});

async function readyDraft() {
  const loaded = await loadBillingSettings();
  if (loaded.kind !== "ready") throw new Error("expected ready");
  return { loaded, draft: settingsToDraft(loaded.settings) };
}

test("[BIL-01] loads the default price, trial, due and grace settings", async () => {
  const { loaded } = await readyDraft();
  expect(loaded.settings).toMatchObject({
    priceDzd: 5000,
    trialDays: 30,
    dueDays: 7,
    graceDays: 7,
  });
});

test("[BIL-01][ADM-08] saves new settings with a reason and returns them", async () => {
  const { loaded, draft } = await readyDraft();
  const result = await saveBillingSettings({
    draft: {
      ...draft,
      priceDzd: "6000",
      taxRatePercent: "19,5",
      companyName: "Société fictive",
      companyAddress: "Alger",
      reason: "Nouveau tarif",
    },
    expectedSessionId: loaded.sessionId,
    key: crypto.randomUUID(),
  });
  expect(result).toMatchObject({
    kind: "saved",
    settings: {
      priceDzd: 6000,
      taxRateBasisPoints: 1950,
      legalDetails: {
        companyName: "Société fictive",
        companyAddress: "Alger",
        registrationNumber: null,
        taxId: null,
      },
    },
  });

  const reloaded = await loadBillingSettings();
  expect(reloaded.kind === "ready" && reloaded.settings.priceDzd).toBe(6000);
});

test("[BIL-01] rejects bad numbers and a missing reason before sending", async () => {
  const { draft } = await readyDraft();
  expect(draftToInput({ ...draft, priceDzd: "1e4", reason: "x" }).success).toBe(false);
  expect(draftToInput({ ...draft, priceDzd: "0", reason: "x" }).success).toBe(false);
  expect(draftToInput({ ...draft, trialDays: "2.5", reason: "x" }).success).toBe(false);
  const save = (overrides: Partial<typeof draft>) =>
    saveBillingSettings({
      draft: { ...draft, ...overrides },
      expectedSessionId: ids.sessionId,
      key: "k",
    });
  expect(await save({ reason: " " })).toEqual({ kind: "invalid", field: "reason" });
  expect(await save({ graceDays: "-1", reason: "x" })).toEqual({
    kind: "invalid",
    field: "graceDays",
  });
  expect(await save({ companyName: "Seulement le nom", reason: "x" })).toEqual({
    kind: "invalid",
    field: "companyAddress",
  });
});

test("[ADM-08] reports a changed admin session", async () => {
  const { draft } = await readyDraft();
  const result = await saveBillingSettings({
    draft: { ...draft, reason: "x" },
    expectedSessionId: ids.subscriptionId,
    key: crypto.randomUUID(),
  });
  expect(result).toEqual({ kind: "session-changed" });
});
