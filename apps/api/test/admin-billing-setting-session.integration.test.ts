import { adminBillingSettingsOutput, billingSettingsDefaults } from "@zaafran/contracts/billing";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date().toISOString();
const { database, openApi, seedActor } = registerMerchantApiFixture(now);
const url = "/v1/admin/billing/settings";

test("[AUTH-05][AUTH-06][ADM-07][BIL-01] billing settings writes require a live admin session and preserve its audit actor", async () => {
  const [admin, revokedAdmin, customer] = await Promise.all([
    seedActor("+213500000001", "admin"),
    seedActor("+213500000002", "admin"),
    seedActor("+213500000003", "standard"),
  ]);
  const api = await openApi();
  const initialSettings = { ...billingSettingsDefaults, priceDzd: 5500, dueDays: 11 };
  const initial = await api.inject({
    method: "PUT",
    url,
    headers: {
      ...revokedAdmin.headers,
      "x-expected-session-id": revokedAdmin.sessionId,
      "idempotency-key": "billing-before-revocation",
    },
    payload: { settings: initialSettings, reason: "Synthetic initial billing settings" },
  });
  expect(initial.statusCode).toBe(200);
  expect(adminBillingSettingsOutput.parse(initial.json())).toEqual({
    sessionId: revokedAdmin.sessionId,
    settings: initialSettings,
  });
  const { sql } = database.get();
  await sql`UPDATE public.sessions SET revoked_at = ${now} WHERE id = ${revokedAdmin.sessionId}`;
  const beforeSettings =
    await sql`SELECT to_jsonb(settings) AS data FROM public.billing_settings AS settings`;
  const beforeReceipts = await sql`SELECT to_jsonb(receipt) AS data
    FROM public.billing_command_receipts AS receipt ORDER BY actor_id, operation, key_hash`;
  const beforeAudit =
    await sql`SELECT to_jsonb(event) AS data FROM public.audit_log AS event ORDER BY id`;
  expect(beforeSettings).toHaveLength(1);
  expect(beforeReceipts).toHaveLength(1);

  for (const actor of [
    { label: "guest", headers: {}, sessionId: admin.sessionId, expected: 401 },
    { label: "standard", headers: customer.headers, sessionId: customer.sessionId, expected: 403 },
    {
      label: "revoked",
      headers: revokedAdmin.headers,
      sessionId: revokedAdmin.sessionId,
      expected: 401,
    },
  ]) {
    const denied = await api.inject({
      method: "PUT",
      url,
      headers: {
        ...actor.headers,
        "x-expected-session-id": actor.sessionId,
        "idempotency-key": `denied-billing-${actor.label}`,
      },
      payload: {
        settings: { ...billingSettingsDefaults, priceDzd: 7000, dueDays: 21 },
        reason: "Synthetic unauthorized billing settings",
      },
    });
    expect(denied.statusCode, actor.label).toBe(actor.expected);
    expect(denied.json()).toMatchObject({
      code: actor.expected === 401 ? "unauthenticated" : "forbidden",
    });
    expect(denied.json()).not.toHaveProperty("settings");
    expect(
      await sql`SELECT to_jsonb(settings) AS data FROM public.billing_settings AS settings`,
    ).toEqual(beforeSettings);
    expect(
      await sql`SELECT to_jsonb(receipt) AS data
      FROM public.billing_command_receipts AS receipt ORDER BY actor_id, operation, key_hash`,
    ).toEqual(beforeReceipts);
    expect(
      await sql`SELECT to_jsonb(event) AS data FROM public.audit_log AS event ORDER BY id`,
    ).toEqual(beforeAudit);
  }

  const settings = {
    ...billingSettingsDefaults,
    priceDzd: 6500,
    dueDays: 14,
    taxRateBasisPoints: 1000,
  };
  const reason = "Synthetic authorized billing settings";
  const updated = await api.inject({
    method: "PUT",
    url,
    headers: {
      ...admin.headers,
      "x-expected-session-id": admin.sessionId,
      "idempotency-key": "authorized-billing-settings",
    },
    payload: { settings, reason },
  });
  expect(updated.statusCode).toBe(200);
  expect(updated.headers["cache-control"]).toBe("no-store");
  expect(adminBillingSettingsOutput.parse(updated.json())).toEqual({
    sessionId: admin.sessionId,
    settings,
  });
  expect(
    await sql`SELECT price_dzd, due_days, tax_rate_basis_points FROM public.billing_settings`,
  ).toEqual([{ price_dzd: 6500, due_days: 14, tax_rate_basis_points: 1000 }]);
  expect(
    await sql`SELECT actor_id, operation, target_id, reason, result,
      recorded_at = ${now}::timestamptz AS at_request_time
    FROM public.billing_command_receipts WHERE actor_id = ${admin.userId}`,
  ).toEqual([
    {
      actor_id: admin.userId,
      operation: "settings_update",
      target_id: null,
      reason,
      result: { settings },
      at_request_time: true,
    },
  ]);
  expect(await sql`SELECT FROM public.billing_command_receipts`).toHaveLength(2);
});
