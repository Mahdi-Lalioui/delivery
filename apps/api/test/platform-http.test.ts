import type { createPlatformRepository } from "@zaafran/db/platform";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";

type Repository = ReturnType<typeof createPlatformRepository>;
const accountId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const now = new Date("2026-11-08T12:00:00Z");
const headers = { "idempotency-key": "fixture-platform", "x-expected-session-id": sessionId };
const reason = "Mise à jour fictive";
const settings = {
  order_accept_timeout_seconds: 480,
  first_order_cash_cap_dzd: 6_000,
  subscription_price_dzd: 5_000,
  subscription_trial_days: 30,
  maintenance_banner: null,
};

function setup() {
  const repository = {
    readPublicFlags: vi.fn<Repository["readPublicFlags"]>(),
    readAdminSettings: vi.fn<Repository["readAdminSettings"]>(),
    updateSetting: vi.fn<Repository["updateSetting"]>(),
    updateFlag: vi.fn<Repository["updateFlag"]>(),
    listAudit: vi.fn<Repository["listAudit"]>(),
  } satisfies Repository;
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve({ accountId, sessionId, role: "admin" }),
    platform: { repository, now: () => now },
  });
  onTestFinished(() => api.close());
  return { api, repository };
}

test("[ADM-08:http] publicly revalidates the current flags with a weak ETag", async () => {
  const { api, repository } = setup();
  const flags = { flags: { ramadan_mode: false }, maintenanceBanner: null };
  repository.readPublicFlags.mockResolvedValue(flags);
  const original = await api.inject("/v1/flags");
  expect(original.statusCode).toBe(200);
  expect(original.json()).toEqual(flags);
  const etag = String(original.headers.etag);
  expect(etag).toMatch(/^W\/"[a-f0-9]{64}"$/u);
  expect(original.headers["cache-control"]).toBe("public, no-cache");
  const revalidated = await api.inject({
    url: "/v1/flags",
    headers: { "if-none-match": '"earlier", ' + etag.slice(2) },
  });
  expect(revalidated.statusCode).toBe(304);
  expect(revalidated.body).toBe("");
  repository.readPublicFlags.mockResolvedValue({ ...flags, flags: { ramadan_mode: true } });
  const changed = await api.inject({ url: "/v1/flags", headers: { "if-none-match": etag } });
  expect(changed.statusCode).toBe(200);
  expect(changed.headers.etag).not.toBe(etag);
});

test("[ADM-08:http] validates settings by key and binds mutations to the session", async () => {
  const { api, repository } = setup();
  repository.readAdminSettings.mockResolvedValue({ settings });
  const path = "/v1/admin/settings";
  const read = await api.inject(path);
  expect(read.json()).toEqual({ settings, sessionId });
  const url = path + "/order_accept_timeout_seconds";
  const wrong = await api.inject({ method: "PUT", url, headers, payload: { value: null, reason } });
  expect(wrong.statusCode).toBe(400);
  const stale = await api.inject({
    method: "PUT",
    url,
    headers: { ...headers, "x-expected-session-id": accountId },
    payload: { value: 480, reason },
  });
  expect(stale.json()).toMatchObject({ code: "session_changed" });
  expect(repository.updateSetting).not.toHaveBeenCalled();
  repository.updateSetting.mockResolvedValue({ kind: "applied", value: { settings } });
  const written = await api.inject({
    method: "PUT",
    url,
    headers,
    payload: { value: 480, reason },
  });
  expect(written.statusCode).toBe(200);
  expect(written.json()).toEqual({ settings, sessionId });
  expect(repository.updateSetting).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      adminUserId: accountId,
      key: "order_accept_timeout_seconds",
      input: { value: 480, reason },
      now,
    }),
  );
});

test("[ADM-08/09:http] validates flag commands and returns admin audit pagination", async () => {
  const { api, repository } = setup();
  const flag = { key: "ramadan_mode", isEnabled: true, scope: null, updatedAt: now.toISOString() };
  repository.updateFlag.mockResolvedValue({ kind: "replayed", value: flag });
  const result = await api.inject({
    method: "PUT",
    url: "/v1/admin/flags/ramadan_mode",
    headers,
    payload: { isEnabled: true, reason },
  });
  expect(result.statusCode).toBe(200);
  expect(result.json()).toEqual(flag);
  repository.listAudit.mockResolvedValue({ events: [], nextCursor: null });
  const audit = await api.inject("/v1/admin/audit?entity=setting&limit=3");
  expect(audit.statusCode).toBe(200);
  expect(audit.json()).toEqual({ events: [], nextCursor: null, sessionId });
  expect(repository.listAudit).toHaveBeenCalledExactlyOnceWith({
    adminUserId: accountId,
    entity: "setting",
    limit: 3,
  });
});
