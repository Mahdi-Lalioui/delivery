import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import {
  loadAudit,
  loadPlatform,
  saveFlag,
  saveSetting,
} from "../src/admin/platform/platform-http";
import {
  platformHandlers,
  platformMockIds as ids,
  platformMockState,
} from "./mocks/platform-handlers";

const server = setupServer();
let state = platformMockState();

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});
beforeEach(() => {
  state = platformMockState();
  server.resetHandlers(...platformHandlers(state));
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

const write = { reason: "Ajustement", sessionId: ids.sessionId, idempotencyKey: "k" };

test("[ADM-08] loads settings with the admin session and the current kill switches", async () => {
  expect(await loadPlatform()).toMatchObject({
    kind: "ready",
    sessionId: ids.sessionId,
    settings: { first_order_cash_cap_dzd: 5000, maintenance_banner: null },
    flags: { ramadan_mode: true, online_payments: false, menu_photo_import: false },
  });
});

test("[ADM-08] saves a setting and a flag with a reason, bound to the session", async () => {
  expect(await saveSetting({ ...write, key: "first_order_cash_cap_dzd", value: 3000 })).toEqual({
    kind: "saved",
  });
  expect(state.settings.first_order_cash_cap_dzd).toBe(3000);
  const banner = { ar: "صيانة", fr: "Maintenance", en: "Maintenance" };
  expect(await saveSetting({ ...write, key: "maintenance_banner", value: banner })).toEqual({
    kind: "saved",
  });
  expect(await saveFlag({ ...write, key: "online_payments", isEnabled: true })).toEqual({
    kind: "saved",
  });
  expect(state.flags.online_payments).toBe(true);
});

test("[ADM-08] rejects a missing reason locally and reports a changed session", async () => {
  expect(await saveFlag({ ...write, reason: " ", key: "ramadan_mode", isEnabled: false })).toEqual({
    kind: "invalid",
  });
  expect(
    await saveFlag({ ...write, sessionId: ids.actorId, key: "ramadan_mode", isEnabled: false }),
  ).toEqual({ kind: "session-changed" });
  expect(state.flags.ramadan_mode).toBe(true);
});

test("[ADM-09] lists audit events filtered by entity", async () => {
  expect(await loadAudit({ entity: "flag" })).toMatchObject({
    kind: "ready",
    events: [{ action: "flag.enabled" }],
  });
  expect(await loadAudit({ entity: "invoice" })).toEqual({
    kind: "ready",
    events: [],
    nextCursor: null,
  });
});
