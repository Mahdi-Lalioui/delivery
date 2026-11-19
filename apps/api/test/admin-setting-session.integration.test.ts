import { adminPlatformSettingsOutput } from "@zaafran/contracts/admin-ops";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date().toISOString();
const { database, openApi, seedActor } = registerMerchantApiFixture(now);
const settingKey = "order_accept_timeout_seconds";
const url = `/v1/admin/settings/${settingKey}`;

test("[AUTH-05][AUTH-06][ADM-01][ADM-08] only a live admin session can change and audit a platform setting", async () => {
  const [admin, revokedAdmin, customer] = await Promise.all([
    seedActor("+213500000001", "admin"),
    seedActor("+213500000002", "admin"),
    seedActor("+213500000003", "standard"),
  ]);
  const api = await openApi();
  const initial = await api.inject({
    method: "PUT",
    url,
    headers: {
      ...revokedAdmin.headers,
      "x-expected-session-id": revokedAdmin.sessionId,
      "idempotency-key": "setting-before-revocation",
    },
    payload: { value: 600, reason: "Synthetic initial setting" },
  });
  expect(initial.statusCode).toBe(200);
  expect(adminPlatformSettingsOutput.parse(initial.json())).toMatchObject({
    sessionId: revokedAdmin.sessionId,
    settings: { [settingKey]: 600 },
  });
  const { sql } = database.get();
  await sql`UPDATE public.sessions SET revoked_at = ${now} WHERE id = ${revokedAdmin.sessionId}`;
  const beforeSettings = await sql`SELECT to_jsonb(setting) AS data
    FROM public.platform_settings AS setting ORDER BY key`;
  const beforeReceipts = await sql`SELECT to_jsonb(receipt) AS data
    FROM public.platform_command_receipts AS receipt ORDER BY id`;
  const beforeAudit =
    await sql`SELECT to_jsonb(event) AS data FROM public.audit_log AS event ORDER BY id`;
  expect(beforeReceipts).toHaveLength(1);
  expect(
    await sql`SELECT value, updated_by FROM public.platform_settings WHERE key = ${settingKey}`,
  ).toEqual([{ value: 600, updated_by: revokedAdmin.userId }]);

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
        "idempotency-key": `denied-setting-${actor.label}`,
      },
      payload: { value: 720, reason: "Synthetic unauthorized setting" },
    });
    expect(denied.statusCode, actor.label).toBe(actor.expected);
    expect(denied.json()).toMatchObject({
      code: actor.expected === 401 ? "unauthenticated" : "forbidden",
    });
    expect(denied.json()).not.toHaveProperty("settings");
    expect(
      await sql`SELECT to_jsonb(setting) AS data
      FROM public.platform_settings AS setting ORDER BY key`,
    ).toEqual(beforeSettings);
    expect(
      await sql`SELECT to_jsonb(receipt) AS data
      FROM public.platform_command_receipts AS receipt ORDER BY id`,
    ).toEqual(beforeReceipts);
    expect(
      await sql`SELECT to_jsonb(event) AS data FROM public.audit_log AS event ORDER BY id`,
    ).toEqual(beforeAudit);
  }

  const reason = "Synthetic authorized setting";
  const updated = await api.inject({
    method: "PUT",
    url,
    headers: {
      ...admin.headers,
      "x-expected-session-id": admin.sessionId,
      "idempotency-key": "authorized-setting",
    },
    payload: { value: 900, reason },
  });
  expect(updated.statusCode).toBe(200);
  expect(updated.headers["cache-control"]).toBe("no-store");
  expect(adminPlatformSettingsOutput.parse(updated.json())).toMatchObject({
    sessionId: admin.sessionId,
    settings: { [settingKey]: 900 },
  });
  expect(
    await sql`SELECT value, updated_by FROM public.platform_settings WHERE key = ${settingKey}`,
  ).toEqual([{ value: 900, updated_by: admin.userId }]);
  expect(
    await sql`SELECT actor_id, entity, entity_id, reason, diff
    FROM public.platform_command_receipts WHERE actor_id = ${admin.userId}`,
  ).toEqual([
    {
      actor_id: admin.userId,
      entity: "setting",
      entity_id: settingKey,
      reason,
      diff: { before: 600, after: 900 },
    },
  ]);
  expect(await sql`SELECT FROM public.platform_command_receipts`).toHaveLength(2);
});
