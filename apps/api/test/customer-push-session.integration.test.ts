import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date().toISOString();
const { database, openApi, seedActor } = registerMerchantApiFixture(now);
const url = "/v1/me/push-subscriptions";
const keys = { p256dh: "B" + "A".repeat(86), auth: "A".repeat(22) };
const endpoint = "https://fcm.googleapis.com/fcm/send/session-isolation";

test("[AUTH-07][NOT-04] push endpoints cannot be stolen or removed by another account or a revoked session", async () => {
  const [customerA, customerB] = await Promise.all([
    seedActor("+213500000095", "standard"),
    seedActor("+213500000096", "standard"),
  ]);
  const api = await openApi();
  const registration = await api.inject({
    method: "POST",
    url,
    headers: customerA.headers,
    payload: { endpoint, keys },
  });
  expect(registration.statusCode).toBe(204);

  const stolen = await api.inject({
    method: "POST",
    url,
    headers: customerB.headers,
    payload: { endpoint, keys },
  });
  expect(stolen.statusCode).toBe(409);
  expect(stolen.json()).toMatchObject({ code: "subscription_in_use" });
  const foreignRemoval = await api.inject({
    method: "DELETE",
    url,
    headers: customerB.headers,
    payload: { endpoint },
  });
  expect(foreignRemoval.statusCode).toBe(204);
  const { sql } = database.get();
  expect(
    await sql`SELECT user_id, session_id FROM public.push_subscriptions WHERE endpoint = ${endpoint}`,
  ).toEqual([{ user_id: customerA.userId, session_id: customerA.sessionId }]);

  await sql`UPDATE public.sessions SET revoked_at = ${now} WHERE id = ${customerA.sessionId}`;
  const revokedRemoval = await api.inject({
    method: "DELETE",
    url,
    headers: customerA.headers,
    payload: { endpoint },
  });
  expect(revokedRemoval.statusCode).toBe(401);
  expect(revokedRemoval.json()).toMatchObject({ code: "unauthenticated" });
  expect(
    await sql`SELECT user_id, session_id FROM public.push_subscriptions WHERE endpoint = ${endpoint}`,
  ).toEqual([{ user_id: customerA.userId, session_id: customerA.sessionId }]);
});
