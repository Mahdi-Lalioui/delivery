import { randomUUIDv7 } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { createMerchantRepository } from "../src/merchant.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const accountId = randomUUIDv7();
const approved = randomUUIDv7();
const staffed = randomUUIDv7();
const pending = randomUUIDv7();
const ownedCategory = randomUUIDv7();
const otherCategory = randomUUIDv7();
const now = "2026-11-07T12:00:00.000Z";
const restaurantName = "Restaurant fictif du test";

beforeAll(async () => {
  const { sql } = database.get();
  const communeId = randomUUIDv7();
  await sql`
    INSERT INTO wilayas (code, name_ar, name_fr) VALUES (16, 'الجزائر', 'Alger')
  `;
  await sql`
    INSERT INTO communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    VALUES (${communeId}, '1601', 16, 'بلدية الاختبار', 'Commune fictive',
      ST_SetSRID(ST_MakePoint(3, 36.75), 4326)::geography)
  `;
  await sql`
    INSERT INTO users (id, phone_e164, created_at)
    VALUES (${accountId}, '+213500000049', ${now}::timestamptz)
  `;

  for (const [merchantId, status, role] of [
    [approved, "approved", "owner"],
    [staffed, "approved", "staff"],
    [pending, "pending_review", "owner"],
  ] as const) {
    await sql`
      INSERT INTO merchants
        (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location,
         cuisines, status, created_at)
      VALUES (${merchantId}, ${"fixture-" + merchantId}, ${restaurantName}, 'Propriétaire fictif',
        '+213500000049', ${communeId}, ST_SetSRID(ST_MakePoint(3, 36.75), 4326)::geography,
        ARRAY['algerian'], ${status}, ${now}::timestamptz)
    `;
    await sql`
      INSERT INTO merchant_members (merchant_id, user_id, role)
      VALUES (${merchantId}, ${accountId}, ${role})
    `;
  }

  await sql`
    INSERT INTO categories (id, merchant_id, names, sort)
    VALUES (${ownedCategory}, ${approved}, '{"fr":"Plats fictifs"}', 0),
      (${otherCategory}, ${staffed}, '{"fr":"Menu d’un autre restaurant"}', 0)
  `;
});

type ItemFixture = {
  merchantId?: string;
  categoryId?: string;
  archived?: boolean;
  moderation?: "unreviewed" | "approved" | "blocked_pending_review" | "rejected";
  available?: boolean;
};

async function seedChecklistItem({
  merchantId = approved,
  categoryId = ownedCategory,
  archived = false,
  moderation = "unreviewed",
  available = true,
}: ItemFixture = {}) {
  const { sql } = database.get();
  await sql`
    INSERT INTO items
      (merchant_id, category_id, names, descriptions, price_dzd, tags, prep_extra_min,
       archived_at, moderation_status, is_available)
    VALUES (${merchantId}, ${categoryId}, '{"ar":"طبق تجريبي"}', '{"fr":"Description fictive"}',
      600, '{}', 0, ${archived ? now : null}::timestamptz, ${moderation}, ${available})
  `;
}

test("[MER-02:db] reads approved hours and up to five eligible configured items", async () => {
  const repository = createMerchantRepository(database.get());
  const read = () => repository.getOnboarding({ accountId, merchantId: approved });
  expect(await read()).toEqual({
    merchantId: approved,
    restaurantName,
    hasHours: false,
    itemsTowardMinimum: 0,
  });

  await seedChecklistItem();
  await seedChecklistItem({ moderation: "approved" });
  await seedChecklistItem({ available: false });
  await seedChecklistItem();
  await seedChecklistItem({ archived: true });
  await seedChecklistItem({ moderation: "blocked_pending_review" });
  await seedChecklistItem({ moderation: "rejected" });
  await seedChecklistItem({ merchantId: staffed, categoryId: otherCategory });
  expect(await read()).toMatchObject({ hasHours: false, itemsTowardMinimum: 4 });

  const { sql } = database.get();
  await sql`
    INSERT INTO merchant_hours (merchant_id, weekday, opens_minute, closes_minute)
    VALUES (${approved}, 5, 1080, 120)
  `;
  await seedChecklistItem();
  expect(await read()).toMatchObject({ hasHours: true, itemsTowardMinimum: 5 });
  await seedChecklistItem();
  expect(await read()).toMatchObject({ hasHours: true, itemsTowardMinimum: 5 });
});

test("[MER-02:db] keeps checklist reads scoped to eligible owner and manager memberships", async () => {
  const repository = createMerchantRepository(database.get());
  for (const merchantId of [staffed, pending, randomUUIDv7()]) {
    await expect(repository.getOnboarding({ accountId, merchantId })).resolves.toBeUndefined();
  }
  await expect(
    repository.getOnboarding({ accountId: randomUUIDv7(), merchantId: approved }),
  ).resolves.toBeUndefined();

  const { sql } = database.get();
  await sql`UPDATE merchant_members SET role = 'manager'
    WHERE merchant_id = ${approved} AND user_id = ${accountId}`;
  try {
    await expect(
      repository.getOnboarding({ accountId, merchantId: approved }),
    ).resolves.toMatchObject({ merchantId: approved });
    await sql`UPDATE users SET blocked_at = ${now}::timestamptz WHERE id = ${accountId}`;
    await expect(
      repository.getOnboarding({ accountId, merchantId: approved }),
    ).resolves.toBeUndefined();
  } finally {
    await sql`UPDATE users SET blocked_at = NULL WHERE id = ${accountId}`;
    await sql`UPDATE merchant_members SET role = 'owner'
      WHERE merchant_id = ${approved} AND user_id = ${accountId}`;
  }
});
