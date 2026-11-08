import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { createMenuModerationRepository } from "../src/menu-moderation.ts";
import { createMerchantRepository } from "../src/merchant.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const now = new Date("2026-11-08T12:00:00.000Z");

function fixtureId(serial: number) {
  return `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
}

const communeId = fixtureId(1);
const ownerId = fixtureId(2);
const adminId = fixtureId(3);
const merchantId = fixtureId(10);
const categoryId = fixtureId(11);
const heldItems = [fixtureId(20), fixtureId(21), fixtureId(22)] as const;
const approvedItem = fixtureId(23);

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

beforeAll(async () => {
  const { sql } = database.get();
  const at = now.toISOString();
  await sql`
    insert into wilayas (code, name_ar, name_fr)
    values (16, 'ولاية تجريبية', 'Wilaya de test') on conflict (code) do nothing
  `;
  await sql`
    insert into communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    values (${communeId}, '1698', 16, 'بلدية تجريبية', 'Commune de test',
      st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography)
  `;
  await sql`
    insert into users (id, phone_e164, created_at) values
      (${ownerId}, '+213500000002', ${at}::timestamptz),
      (${adminId}, '+213500000003', ${at}::timestamptz)
  `;
  await sql`insert into admins (user_id, totp_secret_encrypted) values (${adminId}, ${hash("admin")})`;
  await sql`
    insert into merchants
      (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at)
    values (${merchantId}, 'fixture-moderation', 'Restaurant fictif de test', 'Propriétaire de test',
      '+213500000002', ${communeId}, st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography,
      array['algerian'], 'approved', ${at}::timestamptz)
  `;
  await sql`insert into merchant_members (merchant_id, user_id, role) values (${merchantId}, ${ownerId}, 'owner')`;
  await sql`insert into categories (id, merchant_id, names, sort) values (${categoryId}, ${merchantId}, '{"fr":"Plats"}', 0)`;
  for (const [itemId, status] of [
    ...heldItems.map((id) => [id, "blocked_pending_review"] as const),
    [approvedItem, "approved"] as const,
  ]) {
    await sql`
      insert into items (id, merchant_id, category_id, names, descriptions, price_dzd, tags,
        prep_extra_min, moderation_status)
      values (${itemId}, ${merchantId}, ${categoryId}, '{"fr":"Bière pression"}',
        '{"fr":"Pression fictive"}', 300, '{}'::text[], 0, ${status})
    `;
  }
});

type Decision = { decision: "approve" | "reject"; reason: string };

function review(
  itemId: string,
  key: string,
  { adminUserId = adminId, ...body }: Decision & { adminUserId?: string },
) {
  return {
    adminUserId,
    itemId,
    ...body,
    now,
    idempotencyKeyHash: hash(key),
    requestHash: hash(JSON.stringify({ itemId, ...body })),
  };
}

async function visibleItemCount() {
  const merchants = createMerchantRepository(database.get());
  const progress = await merchants.getOnboarding({ merchantId, accountId: ownerId });
  return progress?.itemsTowardMinimum;
}

test("[ADM-04:db] an admin approval is audited, idempotent and lists the item", async () => {
  const repo = createMenuModerationRepository(database.get());
  const { sql } = database.get();
  const [first] = heldItems;
  expect(await visibleItemCount()).toBe(1);

  const approve = review(first, "approve-1", { decision: "approve", reason: "Bière sans alcool" });
  const reviewed = { itemId: first, merchantId, status: "approved", reviewedAt: now };
  expect(await repo.reviewItem(approve)).toEqual({ kind: "reviewed", ...reviewed });
  expect(await visibleItemCount()).toBe(2);
  expect(await repo.reviewItem(approve)).toEqual({ kind: "replayed", ...reviewed });
  const conflicting = review(first, "approve-1", { decision: "reject", reason: "Alcool" });
  expect(await repo.reviewItem(conflicting)).toEqual({ kind: "idempotency_conflict" });

  const audit = await sql`
    select actor_id as "actorId", merchant_id as "merchantId", action, reason from audit_log
  `;
  expect(audit).toEqual([
    { actorId: adminId, merchantId, action: "item_approved", reason: "Bière sans alcool" },
  ]);
  const again = review(first, "approve-2", { decision: "approve", reason: "Encore" });
  expect(await repo.reviewItem(again)).toEqual({ kind: "invalid_status" });
});

test("[ADM-04:db] a rejection keeps the item hidden and only held items can be reviewed", async () => {
  const repo = createMenuModerationRepository(database.get());
  const [, second, third] = heldItems;
  const reject = review(second, "reject-1", { decision: "reject", reason: "Alcool" });
  expect(await repo.reviewItem(reject)).toMatchObject({ kind: "reviewed", status: "rejected" });
  expect(await visibleItemCount()).toBe(2);

  const approveListed = review(approvedItem, "approve-listed", {
    decision: "approve",
    reason: "x",
  });
  expect(await repo.reviewItem(approveListed)).toEqual({ kind: "invalid_status" });
  const missing = review(fixtureId(99), "missing", { decision: "approve", reason: "x" });
  expect(await repo.reviewItem(missing)).toEqual({ kind: "not_found" });
  const byOwner = review(third, "by-owner", {
    decision: "approve",
    reason: "x",
    adminUserId: ownerId,
  });
  expect(await repo.reviewItem(byOwner)).toEqual({ kind: "forbidden" });
  expect(await visibleItemCount()).toBe(2);
});

test("[ADM-04:db] admins page through held items by id on the partial index", async () => {
  const repo = createMenuModerationRepository(database.get());
  const { sql } = database.get();
  const [, , third] = heldItems;
  const queued = [fixtureId(30), fixtureId(31), fixtureId(32)];
  for (const itemId of [...queued, fixtureId(33)]) {
    await sql`
      insert into items (id, merchant_id, category_id, names, descriptions, price_dzd, tags,
        prep_extra_min, moderation_status, archived_at)
      values (${itemId}, ${merchantId}, ${categoryId}, '{"ar":"سجائر"}', '{"fr":"Tabac fictif"}',
        300, '{}'::text[], 0, 'blocked_pending_review',
        ${itemId === fixtureId(33) ? now.toISOString() : null}::timestamptz)
    `;
  }
  const held = (itemId: string) => ({
    itemId,
    merchantId,
    restaurantName: "Restaurant fictif de test",
  });

  const first = await repo.listHeldItems({ adminUserId: adminId, limit: 2 });
  expect(first?.items).toMatchObject([held(third), held(fixtureId(30))]);
  expect(first?.items[1]).toMatchObject({
    names: { ar: "سجائر" },
    descriptions: { fr: "Tabac fictif" },
  });
  expect(first?.nextCursor).toBe(fixtureId(30));
  const second = await repo.listHeldItems({
    adminUserId: adminId,
    cursor: fixtureId(30),
    limit: 2,
  });
  expect(second).toMatchObject({
    items: [held(fixtureId(31)), held(fixtureId(32))],
    nextCursor: null,
  });
  expect(await repo.listHeldItems({ adminUserId: ownerId, limit: 2 })).toBeUndefined();

  const plan = await sql.begin(async (tx) => {
    await tx`SET LOCAL enable_seqscan = off`;
    return tx`
      EXPLAIN (FORMAT JSON) SELECT id FROM items
      WHERE moderation_status = 'blocked_pending_review' AND archived_at IS NULL
        AND id > ${fixtureId(30)}::uuid
      ORDER BY id LIMIT 3
    `;
  });
  expect(JSON.stringify(plan)).toContain("items_held_for_review_idx");
});
