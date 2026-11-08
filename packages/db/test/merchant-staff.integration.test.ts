import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import {
  createMerchantStaffRepository,
  type StaffInvitationCreate,
} from "../src/merchant-staff.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const now = new Date("2026-11-08T09:00:00.000Z");
const later = new Date("2026-11-16T09:00:00.000Z");

function fixtureId(serial: number) {
  return `01932f18-3150-7c33-8a7b-${String(serial).padStart(12, "0")}`;
}

const communeId = fixtureId(1);
const ownerId = fixtureId(2);
const managerId = fixtureId(3);
const staffId = fixtureId(4);
const otherOwnerId = fixtureId(5);
const merchantA = fixtureId(10);
const merchantB = fixtureId(20);
const pending = fixtureId(30);
const phones = {
  owner: "+213500000310",
  manager: "+213500000311",
  staff: "+213500000312",
  otherOwner: "+213500000313",
};

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

function invite(overrides: Partial<StaffInvitationCreate> = {}): StaffInvitationCreate {
  return {
    accountId: ownerId,
    merchantId: merchantA,
    phone: "+213550000320",
    role: "staff",
    tokenHash: hash(`token-${String(overrides.phone)}-${String(overrides.idempotencyKeyHash)}`),
    idempotencyKeyHash: hash("key-1"),
    requestHash: hash("request-1"),
    now,
    ...overrides,
  };
}

async function insertMerchant(id: string, status: string) {
  const { sql } = database.get();
  await sql`
    insert into merchants
      (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at)
    values (${id}, ${`fixture-${id}`}, 'Restaurant fictif', 'Propriétaire fictif',
      '+213500000310', ${communeId}, st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography,
      array['algerian'], ${status}, ${now.toISOString()}::timestamptz)
  `;
}

beforeAll(async () => {
  const { sql } = database.get();
  await sql`
    insert into wilayas (code, name_ar, name_fr)
    values (16, 'ولاية تجريبية', 'Wilaya de test') on conflict (code) do nothing
  `;
  await sql`
    insert into communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    values (${communeId}, '1698', 16, 'بلدية تجريبية', 'Commune de test',
      st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography)
  `;
  const users = [
    [ownerId, phones.owner],
    [managerId, phones.manager],
    [staffId, phones.staff],
    [otherOwnerId, phones.otherOwner],
  ] as const;
  for (const [id, phone] of users) {
    await sql`insert into users (id, phone_e164, created_at) values (${id}, ${phone}, ${now.toISOString()}::timestamptz)`;
  }
  await insertMerchant(merchantA, "approved");
  await insertMerchant(merchantB, "active");
  await insertMerchant(pending, "pending_review");
  const members = [
    [merchantA, ownerId, "owner"],
    [merchantA, managerId, "manager"],
    [merchantA, staffId, "staff"],
    [merchantB, otherOwnerId, "owner"],
    [merchantB, managerId, "owner"],
    [pending, ownerId, "owner"],
  ] as const;
  for (const [merchantId, userId, role] of members) {
    await sql`insert into merchant_members (merchant_id, user_id, role) values (${merchantId}, ${userId}, ${role})`;
  }
});

test("[MER-23:db] an owner invites a phone once and a retry replays the same invitation", async () => {
  const staff = createMerchantStaffRepository(database.get());
  const request = invite({ phone: "+213550000321", role: "manager" });
  const created = await staff.create(request);
  expect(created).toMatchObject({
    kind: "applied",
    invitation: {
      merchantId: merchantA,
      phoneE164: "+213550000321",
      role: "manager",
      status: "pending",
      expiresAt: "2026-11-15T09:00:00.000Z",
    },
  });
  if (created.kind !== "applied") throw new Error("Expected a new invitation.");

  expect(await staff.create(request)).toEqual({ kind: "replayed", invitation: created.invitation });
  expect(await staff.create({ ...request, requestHash: hash("other") })).toEqual({
    kind: "idempotency_conflict",
  });
  expect(
    await staff.create(
      invite({ phone: "+213550000321", idempotencyKeyHash: hash("key-2"), tokenHash: hash("t2") }),
    ),
  ).toEqual({ kind: "already_invited" });
});

test("[MER-23:db] only an owner of an approved restaurant can invite", async () => {
  const staff = createMerchantStaffRepository(database.get());
  for (const accountId of [managerId, staffId, otherOwnerId]) {
    expect(
      await staff.create(invite({ accountId, phone: "+213550000322", tokenHash: hash(accountId) })),
    ).toEqual({ kind: "not_found" });
  }
  expect(
    await staff.create(
      invite({ merchantId: pending, phone: "+213550000322", tokenHash: hash("p") }),
    ),
  ).toEqual({ kind: "not_found" });
  // The same account owns merchant B, so its role there does not leak into merchant A.
  expect(
    await staff.create(
      invite({
        accountId: managerId,
        merchantId: merchantB,
        phone: "+213550000322",
        tokenHash: hash("b"),
      }),
    ),
  ).toMatchObject({ kind: "applied" });
});

test("[MER-23:db] an existing member cannot be invited again", async () => {
  const staff = createMerchantStaffRepository(database.get());
  expect(
    await staff.create(
      invite({ phone: phones.staff, idempotencyKeyHash: hash("k-member"), tokenHash: hash("m") }),
    ),
  ).toEqual({ kind: "already_member" });
});

test("[MER-23:db] the owner lists members and open invitations; other roles see nothing", async () => {
  const staff = createMerchantStaffRepository(database.get());
  await staff.create(
    invite({ phone: "+213550000323", idempotencyKeyHash: hash("k-list"), tokenHash: hash("l") }),
  );
  const list = await staff.list({ accountId: ownerId, merchantId: merchantA, now });
  expect(list?.members).toEqual([
    { userId: ownerId, phoneE164: phones.owner, role: "owner", isSelf: true },
    { userId: managerId, phoneE164: phones.manager, role: "manager", isSelf: false },
    { userId: staffId, phoneE164: phones.staff, role: "staff", isSelf: false },
  ]);
  expect(list?.invitations.map(({ phoneE164 }) => phoneE164)).toContain("+213550000323");
  expect(await staff.list({ accountId: managerId, merchantId: merchantA, now })).toBeUndefined();
  expect(await staff.list({ accountId: otherOwnerId, merchantId: merchantA, now })).toBeUndefined();

  const expired = await staff.list({ accountId: ownerId, merchantId: merchantA, now: later });
  expect(expired?.invitations).toEqual([]);
});

test("[MER-23:db] revoking is owner-only and idempotent, and frees the phone for a new invite", async () => {
  const staff = createMerchantStaffRepository(database.get());
  const phone = "+213550000324";
  const created = await staff.create(
    invite({ phone, idempotencyKeyHash: hash("k-rev"), tokenHash: hash("r") }),
  );
  if (created.kind !== "applied") throw new Error("Expected a new invitation.");
  const { invitationId } = created.invitation;
  const scope = { merchantId: merchantA, invitationId, now };

  expect(await staff.revoke({ ...scope, accountId: managerId })).toEqual({ kind: "not_found" });
  expect(await staff.revoke({ ...scope, accountId: otherOwnerId })).toEqual({ kind: "not_found" });
  expect(await staff.revoke({ ...scope, merchantId: merchantB, accountId: managerId })).toEqual({
    kind: "not_found",
  });
  expect(await staff.revoke({ ...scope, accountId: ownerId })).toEqual({ kind: "revoked" });
  expect(await staff.revoke({ ...scope, accountId: ownerId })).toEqual({ kind: "revoked" });
  expect(
    await staff.create(
      invite({ phone, idempotencyKeyHash: hash("k-rev-2"), tokenHash: hash("r2") }),
    ),
  ).toMatchObject({ kind: "applied" });
});

test("[MER-23:db] an expired open invitation does not block a new one for the same phone", async () => {
  const staff = createMerchantStaffRepository(database.get());
  const phone = "+213550000325";
  await staff.create(invite({ phone, idempotencyKeyHash: hash("k-exp"), tokenHash: hash("e") }));
  expect(
    await staff.create(
      invite({ phone, idempotencyKeyHash: hash("k-exp-2"), tokenHash: hash("e2"), now: later }),
    ),
  ).toMatchObject({ kind: "applied" });
});

test("[MER-23:db] a consumed invitation cannot be revoked", async () => {
  const staff = createMerchantStaffRepository(database.get());
  const created = await staff.create(
    invite({ phone: "+213550000326", idempotencyKeyHash: hash("k-used"), tokenHash: hash("u") }),
  );
  if (created.kind !== "applied") throw new Error("Expected a new invitation.");
  const { invitationId } = created.invitation;
  const { sql } = database.get();
  await sql`
    update merchant_staff_invitations set consumed_at = ${now.toISOString()}::timestamptz,
      consumed_by = ${staffId} where id = ${invitationId}
  `;
  const scope = { accountId: ownerId, merchantId: merchantA, invitationId, now };
  expect(await staff.revoke(scope)).toEqual({ kind: "already_consumed" });
  expect(await staff.revoke({ ...scope, invitationId: fixtureId(99) })).toEqual({
    kind: "not_found",
  });
});
