import { randomUUIDv7 } from "node:crypto";
import { merchantMembershipsOutput } from "@zaafran/contracts/merchant";
import { staffInvitationOutput, staffListOutput } from "@zaafran/contracts/merchant-staff";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = "2026-11-08T12:00:00.000Z";
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);

type Api = Awaited<ReturnType<typeof openApi>>;
type Actor = Awaited<ReturnType<typeof seedActor>>;

function post(api: Api, actor: Actor, request: { url: string; payload?: object }) {
  const { url, payload } = request;
  return api.inject({
    method: "POST",
    url,
    headers: {
      ...actor.headers,
      "idempotency-key": randomUUIDv7(),
      "x-expected-session-id": actor.sessionId,
    },
    ...(payload === undefined ? {} : { payload }),
  });
}

async function addMember(merchantId: string, userId: string, role: string) {
  const { sql } = database.get();
  await sql`INSERT INTO merchant_members (merchant_id, user_id, role)
    VALUES (${merchantId}, ${userId}, ${role})`;
}

test("[MER-23:http] an owner invites by SMS and the invited phone joins with that role", async () => {
  const texts: { phone: string; token: string }[] = [];
  const api = await openApi(undefined, ({ phone, token }) => {
    texts.push({ phone, token });
  });
  const owner = await seedActor("+213500000071", "standard");
  const invitee = await seedActor("+213550000072", "standard");
  const { owned } = await seedMenuMerchants(owner.userId);
  const staffPath = `/v1/merchants/${owned}/staff`;

  const invite = await post(api, owner, {
    url: staffPath + "/invitations",
    payload: {
      phone: "+213550000072",
      role: "manager",
    },
  });
  expect(invite.statusCode).toBe(201);
  expect(staffInvitationOutput.parse(invite.json())).toMatchObject({ role: "manager" });
  expect(texts).toHaveLength(1);
  const token = texts[0]?.token ?? "";
  expect(invite.body).not.toContain(token);

  const list = await api.inject({ url: staffPath, headers: owner.headers });
  expect(staffListOutput.parse(list.json()).invitations).toHaveLength(1);

  const stranger = await seedActor("+213550000073", "standard");
  expect(
    (await post(api, stranger, { url: "/v1/staff-invitations/accept", payload: { token } }))
      .statusCode,
  ).toBe(404);
  const accepted = await post(api, invitee, {
    url: "/v1/staff-invitations/accept",
    payload: { token },
  });
  expect(accepted.statusCode).toBe(200);
  expect(accepted.json()).toEqual({
    merchantId: owned,
    restaurantName: "Restaurant fictif",
    role: "manager",
  });
  const memberships = await api.inject({ url: "/v1/me/merchants", headers: invitee.headers });
  expect(merchantMembershipsOutput.parse(memberships.json()).memberships).toEqual([
    expect.objectContaining({ merchantId: owned, role: "manager" }),
  ]);
});

test("[MER-23:http] managers, staff and another restaurant's owner cannot manage staff", async () => {
  const api = await openApi(undefined, () => undefined);
  const owner = await seedActor("+213500000081", "standard");
  const manager = await seedActor("+213500000082", "standard");
  const staff = await seedActor("+213500000083", "standard");
  const otherOwner = await seedActor("+213500000084", "standard");
  const { owned, staffed } = await seedMenuMerchants(owner.userId, "1603");
  await addMember(owned, manager.userId, "manager");
  await addMember(owned, staff.userId, "staff");
  await addMember(staffed, otherOwner.userId, "owner");

  const invite = await post(api, owner, {
    url: `/v1/merchants/${owned}/staff/invitations`,
    payload: {
      phone: "+213550000085",
      role: "staff",
    },
  });
  const { invitationId } = staffInvitationOutput.parse(invite.json());
  const revokePath = `/v1/merchants/${owned}/staff/invitations/${invitationId}/revoke`;

  for (const actor of [manager, staff, otherOwner]) {
    const list = await api.inject({ url: `/v1/merchants/${owned}/staff`, headers: actor.headers });
    expect(list.statusCode).toBe(404);
    const denied = await post(api, actor, {
      url: `/v1/merchants/${owned}/staff/invitations`,
      payload: {
        phone: "+213550000086",
        role: "staff",
      },
    });
    expect(denied.statusCode).toBe(404);
    expect((await post(api, actor, { url: revokePath })).statusCode).toBe(404);
  }
  // The owner of A is only staff at B, so B's staff stays out of reach.
  const crossRole = await api.inject({
    url: `/v1/merchants/${staffed}/staff`,
    headers: owner.headers,
  });
  expect(crossRole.statusCode).toBe(404);
  expect((await post(api, owner, { url: revokePath })).json()).toEqual({
    invitationId,
    status: "revoked",
  });
});
