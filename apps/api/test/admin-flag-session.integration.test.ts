import { adminFlagOutput } from "@zaafran/contracts/admin-ops";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date().toISOString();
const { database, openApi, seedActor } = registerMerchantApiFixture(now);
const flagKey = "menu_photo_import";
const url = `/v1/admin/flags/${flagKey}`;

test("[AUTH-05][AUTH-06][ADM-01][ADM-08] only a live admin session can change and audit a feature flag", async () => {
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
      "idempotency-key": "flag-before-revocation",
    },
    payload: { isEnabled: true, reason: "Synthetic initial flag" },
  });
  expect(initial.statusCode).toBe(200);
  expect(adminFlagOutput.parse(initial.json())).toEqual({
    key: flagKey,
    isEnabled: true,
    scope: null,
    updatedAt: now,
  });
  const { sql } = database.get();
  await sql`UPDATE public.sessions SET revoked_at = ${now} WHERE id = ${revokedAdmin.sessionId}`;
  const beforeFlags =
    await sql`SELECT to_jsonb(flag) AS data FROM public.feature_flags AS flag ORDER BY key`;
  const beforeReceipts = await sql`SELECT to_jsonb(receipt) AS data
    FROM public.platform_command_receipts AS receipt ORDER BY id`;
  const beforeAudit =
    await sql`SELECT to_jsonb(event) AS data FROM public.audit_log AS event ORDER BY id`;
  expect(beforeReceipts).toHaveLength(1);
  expect(
    await sql`SELECT is_enabled, updated_by FROM public.feature_flags WHERE key = ${flagKey}`,
  ).toEqual([{ is_enabled: true, updated_by: revokedAdmin.userId }]);

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
        "idempotency-key": `denied-flag-${actor.label}`,
      },
      payload: { isEnabled: false, reason: "Synthetic unauthorized flag" },
    });
    expect(denied.statusCode, actor.label).toBe(actor.expected);
    expect(denied.json()).toMatchObject({
      code: actor.expected === 401 ? "unauthenticated" : "forbidden",
    });
    expect(denied.json()).not.toHaveProperty("isEnabled");
    expect(
      await sql`SELECT to_jsonb(flag) AS data FROM public.feature_flags AS flag ORDER BY key`,
    ).toEqual(beforeFlags);
    expect(
      await sql`SELECT to_jsonb(receipt) AS data
      FROM public.platform_command_receipts AS receipt ORDER BY id`,
    ).toEqual(beforeReceipts);
    expect(
      await sql`SELECT to_jsonb(event) AS data FROM public.audit_log AS event ORDER BY id`,
    ).toEqual(beforeAudit);
  }

  const reason = "Synthetic authorized flag";
  const updated = await api.inject({
    method: "PUT",
    url,
    headers: {
      ...admin.headers,
      "x-expected-session-id": admin.sessionId,
      "idempotency-key": "authorized-flag",
    },
    payload: { isEnabled: false, reason },
  });
  expect(updated.statusCode).toBe(200);
  expect(updated.headers["cache-control"]).toBe("no-store");
  const flag = { key: flagKey, isEnabled: false, scope: null, updatedAt: now };
  expect(adminFlagOutput.parse(updated.json())).toEqual(flag);
  expect(
    await sql`SELECT is_enabled, updated_by FROM public.feature_flags WHERE key = ${flagKey}`,
  ).toEqual([{ is_enabled: false, updated_by: admin.userId }]);
  expect(
    await sql`SELECT actor_id, entity, entity_id, reason, diff, result,
      created_at = ${now}::timestamptz AS at_request_time
    FROM public.platform_command_receipts WHERE actor_id = ${admin.userId}`,
  ).toEqual([
    {
      actor_id: admin.userId,
      entity: "flag",
      entity_id: flagKey,
      reason,
      diff: { before: true, after: false },
      result: flag,
      at_request_time: true,
    },
  ]);
  expect(await sql`SELECT FROM public.platform_command_receipts`).toHaveLength(2);
});
