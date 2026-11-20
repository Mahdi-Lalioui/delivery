import { courierInviteOutput, courierInviteAcceptOutput } from "@zaafran/contracts/courier";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date().toISOString();
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);

test("[AUTH-07][COU-INVITE] courier invitations require the invited account and an active session", async () => {
  const [owner, invited, wrongAccount, revokedInvitee, emailInvitee] = await Promise.all([
    seedActor("+213500000181", "standard"),
    seedActor("+213500000182", "standard"),
    seedActor("+213500000183", "standard"),
    seedActor("+213500000184", "standard"),
    seedActor("+213500000185", "standard"),
  ]);
  const { owned: merchantId } = await seedMenuMerchants(owner.userId, "1681");
  const api = await openApi(undefined, { sendCourierInvitation: () => undefined });
  const { sql } = database.get();

  async function invite(destination: { phone: string } | { email: string }) {
    const response = await api.inject({
      method: "POST",
      url: `/v1/merchants/${merchantId}/couriers/invites`,
      headers: { ...owner.headers, "content-type": "application/json" },
      payload: { ...destination, locale: "fr" },
    });
    expect(response.statusCode).toBe(201);
    return courierInviteOutput.parse(response.json());
  }

  async function accept(actor: typeof invited, inviteId: string) {
    return api.inject({
      method: "POST",
      url: "/v1/courier/invites/accept",
      headers: { ...actor.headers, "content-type": "application/json" },
      payload: { inviteId, displayName: "Coursier fictif" },
    });
  }

  const invitation = await invite({ phone: "+213500000182" });
  const concealed = await accept(wrongAccount, invitation.inviteId);
  expect(concealed.statusCode).toBe(404);
  expect(concealed.body).not.toContain("Coursier fictif");
  expect(
    await sql`SELECT id FROM public.couriers WHERE user_id IN (${invited.userId}, ${wrongAccount.userId})`,
  ).toEqual([]);
  expect(
    await sql`SELECT accepted_by, accepted_at FROM public.courier_invitations WHERE id = ${invitation.inviteId}`,
  ).toEqual([{ accepted_by: null, accepted_at: null }]);

  const accepted = await accept(invited, invitation.inviteId);
  expect(accepted.statusCode).toBe(200);
  const acceptedBody = courierInviteAcceptOutput.parse(accepted.json());
  const replay = await accept(invited, invitation.inviteId);
  expect(replay.statusCode).toBe(200);
  expect(courierInviteAcceptOutput.parse(replay.json())).toEqual(acceptedBody);
  expect(
    await sql`SELECT user_id, merchant_id, display_name FROM public.couriers WHERE user_id = ${invited.userId}`,
  ).toEqual([
    { user_id: invited.userId, merchant_id: merchantId, display_name: "Coursier fictif" },
  ]);
  expect(
    await sql`SELECT accepted_by, accepted_at IS NOT NULL AS is_accepted FROM public.courier_invitations WHERE id = ${invitation.inviteId}`,
  ).toEqual([{ accepted_by: invited.userId, is_accepted: true }]);

  const revokedInvitation = await invite({ phone: "+213500000184" });
  await sql`UPDATE public.sessions SET revoked_at = ${now} WHERE id = ${revokedInvitee.sessionId}`;
  const revoked = await accept(revokedInvitee, revokedInvitation.inviteId);
  expect(revoked.statusCode).toBe(401);
  expect(
    await sql`SELECT id FROM public.couriers WHERE user_id = ${revokedInvitee.userId}`,
  ).toEqual([]);
  expect(
    await sql`SELECT accepted_by, accepted_at FROM public.courier_invitations WHERE id = ${revokedInvitation.inviteId}`,
  ).toEqual([{ accepted_by: null, accepted_at: null }]);

  // Directly seed a pre-verified email identity, as the API test fixture does for
  // other verified identifiers; production can only set this after email OTP verification.
  const verifiedEmail = "courier.email.fixture@example.test";
  await sql`UPDATE public.users SET email = ${verifiedEmail} WHERE id = ${emailInvitee.userId}`;
  // The fixture exposes a fake SMS sender but not a fake email invitation sender.
  // Seed the email invitation row so this test still exercises the real acceptance route.
  const [emailInvitation] = await sql<{ id: string }[]>`
    INSERT INTO public.courier_invitations
      (merchant_id, invited_by, email, created_at, expires_at)
    VALUES (${merchantId}, ${owner.userId}, ${verifiedEmail}, ${now}, ${new Date(Date.parse(now) + 7 * 24 * 60 * 60 * 1000).toISOString()})
    RETURNING id
  `;
  if (!emailInvitation) {
    throw new Error("Expected seeded email courier invitation");
  }
  const emailAccepted = await accept(emailInvitee, emailInvitation.id);
  expect(emailAccepted.statusCode).toBe(200);
  expect(courierInviteAcceptOutput.parse(emailAccepted.json())).toMatchObject({ merchantId });
  expect(
    await sql`SELECT user_id, merchant_id FROM public.couriers WHERE user_id = ${emailInvitee.userId}`,
  ).toEqual([{ user_id: emailInvitee.userId, merchant_id: merchantId }]);
  expect(
    await sql`SELECT email, accepted_by FROM public.courier_invitations WHERE id = ${emailInvitation.id}`,
  ).toEqual([{ email: verifiedEmail, accepted_by: emailInvitee.userId }]);
});
