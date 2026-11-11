import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { createAuthRepository } from "../src/auth.ts";
import { createCourierRepository } from "../src/couriers.ts";
import { lockDeletableAccount } from "../src/privacy-account.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const repo = () => createCourierRepository(database.get());
const now = new Date();
const merchantId = randomUUID();
const otherMerchantId = randomUUID();
const ownerPhone = "+213500000021";
const otherPhone = "+213500000022";
const courierPhone = "+213500000023";
let owner: Awaited<ReturnType<typeof account>>;
let other: Awaited<ReturnType<typeof account>>;
let courier: Awaited<ReturnType<typeof account>>;

async function account(phoneE164: string) {
  const auth = createAuthRepository(database.get());
  const user = await auth.transaction((tx) => tx.getOrCreateUserForSignIn({ phoneE164, now }));
  const sessionId = randomUUID();
  await auth.transaction((tx) =>
    tx.insertSession({
      id: sessionId,
      userId: user.id,
      tokenHash: randomBytes(32),
      transport: "web",
      kind: "standard",
      requestIp: "192.0.2.6",
      deviceName: "Fixture",
      now,
    }),
  );
  return { userId: user.id, sessionId };
}

beforeAll(async () => {
  [owner, other, courier] = await Promise.all([
    account(ownerPhone),
    account(otherPhone),
    account(courierPhone),
  ]);
  const { sql } = database.get();
  await sql`INSERT INTO wilayas (code, name_ar, name_fr) VALUES (16, 'الجزائر', 'Alger')`;
  const [commune] = await sql<{ id: string }[]>`
    INSERT INTO communes (code, wilaya_code, name_ar, name_fr, centroid)
    VALUES ('1699', 16, 'تجريبي', 'Test', ST_GeogFromText('SRID=4326;POINT(3 36)')) RETURNING id
  `;
  if (!commune) throw new Error("Expected commune");
  for (const id of [merchantId, otherMerchantId]) {
    await sql`
      INSERT INTO merchants (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at)
      VALUES (${id}, ${"fixture-" + id}, 'Synthetic restaurant', 'Synthetic owner', ${ownerPhone}, ${commune.id},
        ST_GeogFromText('SRID=4326;POINT(3 36)'), ARRAY['algerian'], 'active', now())
    `;
  }
  await sql`INSERT INTO merchant_members (merchant_id, user_id, role) VALUES
    (${merchantId}, ${owner.userId}, 'owner'), (${otherMerchantId}, ${other.userId}, 'owner')`;
});

test("[COU-01] owner-only invites are phone-bound, idempotent and exclusive to one restaurant", async () => {
  const input = { ...owner, merchantId, phone: courierPhone, now };
  expect(await repo().invite({ ...input, ...other })).toEqual({ kind: "not_found" });
  const invited = await repo().invite(input);
  if (invited.kind !== "invited") throw new Error("Expected invite");
  expect(await repo().invite(input)).toEqual(invited);
  const { inviteId } = invited.invite;
  const acceptance = { ...courier, inviteId, now, displayName: "Sami" };
  expect(await repo().accept({ ...acceptance, ...other })).toEqual({ kind: "not_found" });
  const [first, second] = await Promise.all([repo().accept(acceptance), repo().accept(acceptance)]);
  expect(first).toEqual(second);
  expect(first).toMatchObject({ kind: "accepted", courier: { merchantId } });
  expect(
    await repo().invite({ ...other, merchantId: otherMerchantId, phone: courierPhone, now }),
  ).toEqual({ kind: "courier_already_registered" });
  expect(await repo().list({ ...other, merchantId })).toBeUndefined();
  expect(await repo().list({ ...owner, merchantId })).toMatchObject([
    { displayName: "Sami", online: false },
  ]);
  expect(await repo().setPresence({ ...other, online: true })).toBe(false);
  expect(await repo().setPresence({ ...courier, online: true })).toBe(true);
  const { sql } = database.get();
  expect(await sql.begin((tx) => lockDeletableAccount(tx, { ...courier, now }))).toBeUndefined();
  expect(await repo().list({ ...owner, merchantId })).toMatchObject([
    { displayName: "Sami", online: true },
  ]);
});

test("[COU-01] expired invitation cannot grant courier access", async () => {
  const driver = await account("+213500000024");
  const invitation = await repo().invite({ ...owner, merchantId, phone: "+213500000024", now });
  if (invitation.kind !== "invited") throw new Error("Expected invite");
  const { inviteId, expiresAt } = invitation.invite;
  expect(await repo().accept({ ...driver, inviteId, now: new Date(expiresAt) })).toEqual({
    kind: "invite_expired",
  });
  expect(await repo().setPresence({ ...driver, online: true })).toBe(false);
  const { sql } = database.get();
  await sql`UPDATE public.sessions SET revoked_at = now() WHERE id = ${driver.sessionId}`;
  expect(await repo().accept({ ...driver, inviteId, now })).toEqual({ kind: "unauthorized" });
});
