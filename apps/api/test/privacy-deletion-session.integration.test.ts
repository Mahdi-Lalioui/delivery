import { randomUUID } from "node:crypto";
import { addressOutput } from "@zaafran/contracts/addresses";
import {
  customerPrivacyChallengeOutput,
  customerPrivacyExportOutput,
} from "@zaafran/contracts/retention";
import { expect, onTestFinished, test } from "vitest";
import { createSessionToken } from "../src/auth-crypto.ts";
import { startApi } from "../src/start.ts";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date().toISOString();
const { database, seedActor } = registerMerchantApiFixture(now);

test("[CUS-24][AUTH-03][AUTH-07] deletion challenges bind erasure and replay to the initiating customer's session", async () => {
  const targetPhone = "+213500000001";
  const otherPhone = "+213500000002";
  const [target, other] = await Promise.all([
    seedActor(targetPhone, "standard"),
    seedActor(otherPhone, "standard"),
  ]);
  const { sql } = database.get();
  const secondaryId = randomUUID();
  const secondaryToken = createSessionToken();
  await sql`INSERT INTO public.sessions (
      id, user_id, token_hash, transport, kind, request_ip, device_name, created_at, last_seen_at, expires_at
    ) VALUES (${secondaryId}, ${target.userId}, ${secondaryToken.tokenHash}, 'web', 'standard',
      '192.0.2.2', 'Secondary fixture', ${now}, ${now}, ${now}::timestamptz + interval '1 day')`;
  const secondaryHeaders = { ...target.headers, cookie: "__Host-session=" + secondaryToken.token };
  await sql`INSERT INTO public.service_areas (slug, city, active, polygon)
    VALUES ('deletion-isolation', 'Alger', true,
      ST_GeogFromText('SRID=4326;MULTIPOLYGON(((3 36,4 36,4 37,3 37,3 36)))'))`;
  const sent = new Map<string, { phone: string; code: string }>();
  const api = await startApi({
    environment: {
      DATABASE_URL: database.url(),
      AUTH_PUBLIC_ORIGIN: "https://zaafran.test",
      AUTH_OTP_KEY: Buffer.alloc(32, 19).toString("hex"),
      AUTH_TOTP_KEY: Buffer.alloc(32, 26).toString("hex"),
    },
    now: () => new Date(now),
    sendSms({ deliveryKey, phone, code }) {
      sent.set(deliveryKey, { phone, code });
    },
    async listen(app) {
      await app.ready();
      return "http://127.0.0.1:3002";
    },
  });
  onTestFinished(() => api.close());
  const targetSaved = await api.inject({
    method: "POST",
    url: "/v1/me/addresses",
    headers: target.headers,
    payload: { label: "Target private address", pin: { latitude: 36.75, longitude: 3.0625 } },
  });
  const otherSaved = await api.inject({
    method: "POST",
    url: "/v1/me/addresses",
    headers: other.headers,
    payload: { label: "Other private address", pin: { latitude: 36.751, longitude: 3.0625 } },
  });
  expect(targetSaved.statusCode).toBe(201);
  expect(otherSaved.statusCode).toBe(201);
  const targetAddress = addressOutput.parse(targetSaved.json());
  const otherAddress = addressOutput.parse(otherSaved.json());
  expect((await api.inject({ url: "/v1/me/export", headers: secondaryHeaders })).statusCode).toBe(
    200,
  );

  const issued = await api.inject({
    method: "POST",
    url: "/v1/me/deletion-challenge",
    headers: { ...target.headers, "idempotency-key": "target-deletion-challenge" },
  });
  expect(issued.statusCode).toBe(201);
  const challenge = customerPrivacyChallengeOutput.parse(issued.json());
  const delivery = sent.get("account-delete:" + challenge.challengeId);
  expect(delivery?.phone).toBe(targetPhone);
  expect(sent.size).toBe(1);
  if (!delivery) throw new Error("Expected the synthetic deletion OTP delivery.");
  const payload = { challengeId: challenge.challengeId, code: delivery.code };
  expect(
    await sql`SELECT user_id, delivered_at IS NOT NULL AS delivered, attempts
    FROM public.account_deletion_challenges WHERE id = ${challenge.challengeId}`,
  ).toEqual([{ user_id: target.userId, delivered: true, attempts: 0 }]);
  const beforeUsers =
    await sql`SELECT id, phone_e164, email, deleted_at FROM public.users ORDER BY id`;
  const beforeAddresses =
    await sql`SELECT to_jsonb(address) AS data FROM public.addresses AS address ORDER BY id`;
  expect(beforeUsers).toHaveLength(2);
  expect(beforeAddresses).toHaveLength(2);
  const foreign = await api.inject({
    method: "DELETE",
    url: "/v1/me",
    headers: other.headers,
    payload,
  });
  expect(foreign.statusCode).toBe(409);
  expect(foreign.json()).toMatchObject({ code: "challenge_expired" });
  expect(foreign.body).not.toContain(delivery.code);
  expect(await sql`SELECT id, phone_e164, email, deleted_at FROM public.users ORDER BY id`).toEqual(
    beforeUsers,
  );
  expect(
    await sql`SELECT to_jsonb(address) AS data FROM public.addresses AS address ORDER BY id`,
  ).toEqual(beforeAddresses);
  expect(
    await sql`SELECT attempts FROM public.account_deletion_challenges WHERE id = ${challenge.challengeId}`,
  ).toEqual([{ attempts: 0 }]);
  expect(await sql`SELECT FROM public.account_deletion_audit`).toHaveLength(0);
  expect(await sql`SELECT FROM public.account_deletion_proofs`).toHaveLength(0);
  expect(await sql`SELECT FROM public.sessions WHERE revoked_at IS NOT NULL`).toHaveLength(0);

  const request = { method: "DELETE", url: "/v1/me", headers: target.headers, payload } as const;
  const deleted = await api.inject(request);
  expect(deleted.statusCode).toBe(204);
  expect(deleted.body).toBe("");
  expect(deleted.headers["set-cookie"]).toContain("Max-Age=0");
  expect(
    await sql`SELECT phone_e164, email, deleted_at IS NOT NULL AS deleted
    FROM public.users WHERE id = ${target.userId}`,
  ).toEqual([{ phone_e164: null, email: null, deleted: true }]);
  expect(
    await sql`SELECT count(*)::int AS count FROM public.sessions WHERE user_id = ${target.userId}`,
  ).toEqual([{ count: 2 }]);
  expect(
    await sql`SELECT count(*)::int AS count FROM public.sessions
    WHERE user_id = ${target.userId} AND revoked_at IS NOT NULL AND device_name IS NULL AND request_ip IS NULL`,
  ).toEqual([{ count: 2 }]);
  expect(
    await sql`SELECT FROM public.addresses WHERE id = ${targetAddress.addressId}`,
  ).toHaveLength(0);
  expect(await sql`SELECT user_id FROM public.account_deletion_audit`).toEqual([
    { user_id: target.userId },
  ]);
  expect(
    await sql`SELECT session_id FROM public.account_deletion_proofs WHERE challenge_id = ${challenge.challengeId}`,
  ).toEqual([{ session_id: target.sessionId }]);
  for (const headers of [target.headers, secondaryHeaders]) {
    expect((await api.inject({ url: "/v1/me/export", headers })).statusCode).toBe(401);
  }
  const otherExport = await api.inject({ url: "/v1/me/export", headers: other.headers });
  expect(otherExport.statusCode).toBe(200);
  const exported = customerPrivacyExportOutput.parse(otherExport.json());
  expect(exported.profile).toEqual({ accountId: other.userId, phoneE164: otherPhone });
  expect(exported.addresses).toMatchObject([
    { addressId: otherAddress.addressId, label: otherAddress.label },
  ]);

  const replayed = await api.inject(request);
  expect(replayed.statusCode).toBe(204);
  expect(replayed.body).toBe("");
  expect(replayed.headers["set-cookie"]).toContain("Max-Age=0");
  expect(await sql`SELECT user_id FROM public.account_deletion_audit`).toEqual([
    { user_id: target.userId },
  ]);
  expect(
    await sql`SELECT session_id FROM public.account_deletion_proofs WHERE challenge_id = ${challenge.challengeId}`,
  ).toEqual([{ session_id: target.sessionId }]);
});
