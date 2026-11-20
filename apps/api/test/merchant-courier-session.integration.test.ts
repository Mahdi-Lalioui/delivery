import { courierInviteOutput, courierRosterOutput } from "@zaafran/contracts/courier";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date().toISOString();
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);

test("[AUTH-07][MER-18] merchant courier rosters and invitations stay within the owner's restaurant", async () => {
  const [ownerA, ownerB] = await Promise.all([
    seedActor("+213500000091", "standard"),
    seedActor("+213500000092", "standard"),
  ]);
  const [{ owned: merchantA }, { owned: merchantB }] = await Promise.all([
    seedMenuMerchants(ownerA.userId, "1602"),
    seedMenuMerchants(ownerB.userId, "1603"),
  ]);
  const marker = "Synthetic courier B";
  const { sql } = database.get();
  await sql`INSERT INTO public.couriers (user_id, merchant_id, display_name, created_at)
    VALUES (${ownerB.userId}, ${merchantB}, ${marker}, ${now})`;
  const api = await openApi(undefined, { sendCourierInvitation: () => undefined });

  const rosterB = await api.inject({
    url: `/v1/merchants/${merchantB}/couriers`,
    headers: ownerB.headers,
  });
  expect(rosterB.statusCode).toBe(200);
  expect(courierRosterOutput.parse(rosterB.json()).couriers).toEqual([
    expect.objectContaining({ displayName: marker }),
  ]);

  const beforeInvites = await sql`SELECT id, merchant_id, phone_e164, email
    FROM public.courier_invitations ORDER BY id`;
  for (const route of [
    { method: "GET" as const, url: `/v1/merchants/${merchantB}/couriers`, actor: ownerA },
    {
      method: "POST" as const,
      url: `/v1/merchants/${merchantB}/couriers/invites`,
      actor: ownerA,
      payload: { phone: "+213550000093", locale: "fr" },
    },
  ]) {
    const denied = await api.inject({
      method: route.method,
      url: route.url,
      headers:
        route.method === "POST"
          ? { ...route.actor.headers, "content-type": "application/json" }
          : route.actor.headers,
      ...(route.method === "POST" ? { payload: route.payload } : {}),
    });
    expect(denied.statusCode).toBe(404);
    expect(denied.body).not.toContain(marker);
    expect(
      await sql`SELECT id, merchant_id, phone_e164, email FROM public.courier_invitations ORDER BY id`,
    ).toEqual(beforeInvites);
  }

  const ownInvite = await api.inject({
    method: "POST",
    url: `/v1/merchants/${merchantA}/couriers/invites`,
    headers: { ...ownerA.headers, "content-type": "application/json" },
    payload: { phone: "+213550000094", locale: "fr" },
  });
  expect(ownInvite.statusCode).toBe(201);
  expect(courierInviteOutput.parse(ownInvite.json())).toHaveProperty("inviteId");
  expect(
    await sql`SELECT merchant_id, phone_e164 FROM public.courier_invitations ORDER BY merchant_id`,
  ).toEqual([{ merchant_id: merchantA, phone_e164: "+213550000094" }]);
});
