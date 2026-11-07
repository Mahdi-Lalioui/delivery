import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import {
  createMenuPriceRepository,
  type BulkPriceApply,
  type BulkPriceUndo,
} from "../src/menu-price.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const now = new Date("2026-11-07T12:00:00.000Z");

function fixtureId(serial: number) {
  return `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
}

function merchantFixture(serial: number, role: "owner" | "staff" = "owner") {
  return {
    merchantId: fixtureId(serial),
    categoryId: fixtureId(serial + 1),
    firstItem: fixtureId(serial + 2),
    secondItem: fixtureId(serial + 3),
    bigItem: fixtureId(serial + 4),
    role,
  };
}

const communeId = fixtureId(1);
const ownerId = fixtureId(2);
const staffId = fixtureId(3);
const previewing = merchantFixture(10);
const staffed = merchantFixture(20, "staff");
const applying = merchantFixture(30);
const replaying = merchantFixture(40);
const staleRevision = merchantFixture(50);
const missingItem = merchantFixture(60);
const overflowing = merchantFixture(70);
const foreign = merchantFixture(80);
const undoing = merchantFixture(90);
const expiring = merchantFixture(100);
const changedSince = merchantFixture(110);
const undoneTwice = merchantFixture(120);

const merchants = [
  previewing,
  staffed,
  applying,
  replaying,
  staleRevision,
  missingItem,
  overflowing,
  foreign,
  undoing,
  expiring,
  changedSince,
  undoneTwice,
];

beforeAll(async () => {
  const { sql } = database.get();
  await sql`
    insert into wilayas (code, name_ar, name_fr)
    values (16, 'ولاية تجريبية', 'Wilaya de test') on conflict (code) do nothing
  `;
  await sql`
    insert into communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    values (${communeId}, '1699', 16, 'بلدية تجريبية', 'Commune de test',
      st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography)
  `;
  await sql`
    insert into users (id, phone_e164, created_at) values
      (${ownerId}, '+213500000010', ${now.toISOString()}::timestamptz),
      (${staffId}, '+213500000011', ${now.toISOString()}::timestamptz)
  `;
  for (const { merchantId, categoryId, firstItem, secondItem, bigItem, role } of merchants) {
    await sql`
      insert into merchants
        (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at)
      values (${merchantId}, ${`fixture-${merchantId}`}, 'Restaurant fictif de test', 'Propriétaire de test',
        '+213500000010', ${communeId}, st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography,
        array['algerian'], 'approved', ${now.toISOString()}::timestamptz)
    `;
    await sql`insert into merchant_members (merchant_id, user_id, role) values (${merchantId}, ${ownerId}, ${role})`;
    await sql`insert into categories (id, merchant_id, names, sort) values (${categoryId}, ${merchantId}, '{"fr":"Plats"}'::jsonb, 0)`;
    await sql`
      insert into items (id, merchant_id, category_id, names, descriptions, price_dzd, tags, prep_extra_min) values
        (${firstItem}, ${merchantId}, ${categoryId}, '{"fr":"Plat un"}'::jsonb, '{"fr":"Description"}'::jsonb, 500, '{}', 0),
        (${secondItem}, ${merchantId}, ${categoryId}, '{"fr":"Plat deux"}'::jsonb, '{"fr":"Description"}'::jsonb, 1200, '{}', 0),
        (${bigItem}, ${merchantId}, ${categoryId}, '{"fr":"Plat trois"}'::jsonb, '{"fr":"Description"}'::jsonb, 2000000000, '{}', 0)
    `;
  }
  await sql`insert into merchant_members (merchant_id, user_id, role) values (${staffed.merchantId}, ${staffId}, 'staff')`;
});

function repository() {
  return createMenuPriceRepository(database.get());
}

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

function apply({
  merchantId,
  key,
  input,
  accountId = ownerId,
}: {
  merchantId: string;
  key: string;
  input: BulkPriceApply["input"];
  accountId?: string;
}): BulkPriceApply {
  return {
    merchantId,
    accountId,
    now,
    input,
    idempotencyKeyHash: hash(key),
    requestHash: hash(JSON.stringify(input)),
  };
}

test("[MER-11:db] previews a percent rise against the current prices without writing", async () => {
  const result = await repository().preview({
    accountId: ownerId,
    merchantId: previewing.merchantId,
    itemIds: [previewing.firstItem, previewing.secondItem],
    adjustment: { kind: "percent", basisPoints: 1_000 },
    roundingUnit: 10,
  });
  expect(result).toEqual({
    kind: "previewed",
    revision: 0,
    items: [
      { itemId: previewing.firstItem, oldPriceDzd: 500, newPriceDzd: 550 },
      { itemId: previewing.secondItem, oldPriceDzd: 1_200, newPriceDzd: 1_320 },
    ],
  });
  const [item] = await database.get()
    .sql`select price_dzd as "priceDzd" from items where id = ${previewing.firstItem}`;
  expect(item?.priceDzd).toBe(500);
});

test("[MER-11:db] denies a preview for an item owned by another merchant", async () => {
  const result = await repository().preview({
    accountId: ownerId,
    merchantId: previewing.merchantId,
    itemIds: [previewing.firstItem, foreign.firstItem],
    adjustment: { kind: "percent", basisPoints: 1_000 },
    roundingUnit: 10,
  });
  expect(result).toEqual({ kind: "not_found" });
});

test("[MER-11:db] denies staff from previewing or applying a bulk price change", async () => {
  const preview = await repository().preview({
    accountId: staffId,
    merchantId: staffed.merchantId,
    itemIds: [staffed.firstItem],
    adjustment: { kind: "percent", basisPoints: 1_000 },
    roundingUnit: 10,
  });
  expect(preview).toEqual({ kind: "not_found" });
  const result = await repository().apply(
    apply({
      merchantId: staffed.merchantId,
      key: "staff-attempt",
      input: {
        itemIds: [staffed.firstItem],
        adjustment: { kind: "percent", basisPoints: 1_000 },
        roundingUnit: 10,
        expectedRevision: 0,
      },
      accountId: staffId,
    }),
  );
  expect(result).toEqual({ kind: "not_found" });
});

test("[MER-11:db] applies the rounded change, records history and a batch, and bumps the revision", async () => {
  const result = await repository().apply(
    apply({
      merchantId: applying.merchantId,
      key: "apply-batch",
      input: {
        itemIds: [applying.firstItem, applying.secondItem],
        adjustment: { kind: "percent", basisPoints: 1_000 },
        roundingUnit: 10,
        expectedRevision: 0,
      },
    }),
  );
  expect(result).toMatchObject({
    kind: "applied",
    revision: 1,
    items: [
      { itemId: applying.firstItem, oldPriceDzd: 500, newPriceDzd: 550 },
      { itemId: applying.secondItem, oldPriceDzd: 1_200, newPriceDzd: 1_320 },
    ],
  });
  if (!("batchId" in result)) throw new Error("Expected the bulk price change to apply.");
  const batchId = result.batchId;

  const { sql } = database.get();
  const prices = await sql<{ priceDzd: number }[]>`
    select id, price_dzd as "priceDzd" from items where id in (${applying.firstItem}, ${applying.secondItem})
    order by id
  `;
  expect(prices.map((row) => row.priceDzd)).toEqual([550, 1_320]);

  const history = await sql`
    select item_id as "itemId", old_price_dzd as "oldPriceDzd", new_price_dzd as "newPriceDzd"
    from price_history where batch_id = ${batchId} order by item_id
  `;
  expect(history).toEqual([
    { itemId: applying.firstItem, oldPriceDzd: 500, newPriceDzd: 550 },
    { itemId: applying.secondItem, oldPriceDzd: 1_200, newPriceDzd: 1_320 },
  ]);
  const [batch] = await sql`
    select merchant_id as "merchantId", actor_id as "actorId" from price_change_batches where id = ${batchId}
  `;
  expect(batch).toEqual({ merchantId: applying.merchantId, actorId: ownerId });
});

test("[MER-11:db] replays an identical retry with the same batch instead of applying twice", async () => {
  const input = {
    itemIds: [replaying.firstItem],
    adjustment: { kind: "percent" as const, basisPoints: 1_000 },
    roundingUnit: 10 as const,
    expectedRevision: 0,
  };
  const first = await repository().apply(
    apply({ merchantId: replaying.merchantId, key: "replay-batch", input }),
  );
  const second = await repository().apply(
    apply({ merchantId: replaying.merchantId, key: "replay-batch", input }),
  );
  expect(second).toEqual({ ...first, kind: "replayed" });

  const { sql } = database.get();
  const history =
    await sql`select count(*)::int as count from price_history where item_id = ${replaying.firstItem}`;
  expect(history[0]?.count).toBe(1);
});

test("[MER-11:db] rejects a stale expected revision", async () => {
  const result = await repository().apply(
    apply({
      merchantId: staleRevision.merchantId,
      key: "stale-revision",
      input: {
        itemIds: [staleRevision.firstItem],
        adjustment: { kind: "percent", basisPoints: 1_000 },
        roundingUnit: 10,
        expectedRevision: 99,
      },
    }),
  );
  expect(result).toEqual({ kind: "revision_conflict" });
});

test("[MER-11:db] rejects applying to a missing or archived item", async () => {
  const result = await repository().apply(
    apply({
      merchantId: missingItem.merchantId,
      key: "missing-item",
      input: {
        itemIds: [fixtureId(99)],
        adjustment: { kind: "percent", basisPoints: 1_000 },
        roundingUnit: 10,
        expectedRevision: 0,
      },
    }),
  );
  expect(result).toEqual({ kind: "not_found" });
});

test("[MER-11:db] rejects a change that would overflow the stored whole-dinar price", async () => {
  const result = await repository().apply(
    apply({
      merchantId: overflowing.merchantId,
      key: "overflow",
      input: {
        itemIds: [overflowing.bigItem],
        adjustment: { kind: "percent", basisPoints: 100_000 },
        roundingUnit: 10,
        expectedRevision: 0,
      },
    }),
  );
  expect(result).toEqual({ kind: "invalid_bulk_price_change" });
  const [item] = await database.get()
    .sql`select price_dzd as "priceDzd" from items where id = ${overflowing.bigItem}`;
  expect(item?.priceDzd).toBe(2_000_000_000);
});

const tenMinutesMs = 10 * 60 * 1_000;

function undo({
  merchantId,
  batchId,
  key,
  expectedRevision,
  at = now,
  accountId = ownerId,
}: {
  merchantId: string;
  batchId: string;
  key: string;
  expectedRevision: number;
  at?: Date;
  accountId?: string;
}): BulkPriceUndo {
  const input = { batchId, expectedRevision };
  return {
    merchantId,
    accountId,
    now: at,
    input,
    idempotencyKeyHash: hash(key),
    requestHash: hash(JSON.stringify(input)),
  };
}

async function applyTenPercent(merchant: ReturnType<typeof merchantFixture>) {
  const result = await repository().apply(
    apply({
      merchantId: merchant.merchantId,
      key: "apply-before-undo",
      input: {
        itemIds: [merchant.firstItem, merchant.secondItem],
        adjustment: { kind: "percent", basisPoints: 1_000 },
        roundingUnit: 10,
        expectedRevision: 0,
      },
    }),
  );
  if (!("batchId" in result)) throw new Error("Expected the bulk price change to apply.");
  return result.batchId;
}

async function readPrices(merchant: ReturnType<typeof merchantFixture>) {
  const rows = await database.get().sql<{ itemId: string; priceDzd: number }[]>`
    select id as "itemId", price_dzd as "priceDzd" from items
    where id in (${merchant.firstItem}, ${merchant.secondItem}) order by id
  `;
  return rows.map((row) => row.priceDzd);
}

test("[MER-11:db] undoes a batch within ten minutes and restores every old price", async () => {
  const batchId = await applyTenPercent(undoing);
  const at = new Date(now.getTime() + tenMinutesMs);
  const result = await repository().undo(
    undo({ merchantId: undoing.merchantId, batchId, key: "undo", expectedRevision: 1, at }),
  );
  expect(result).toEqual({
    kind: "applied",
    revision: 2,
    batchId,
    items: [
      { itemId: undoing.firstItem, oldPriceDzd: 550, newPriceDzd: 500 },
      { itemId: undoing.secondItem, oldPriceDzd: 1_320, newPriceDzd: 1_200 },
    ],
  });
  expect(await readPrices(undoing)).toEqual([500, 1_200]);
  const [batch] = await database.get().sql<{ isUndoneAtRequestTime: boolean }[]>`
    select undone_at = ${at.toISOString()}::timestamptz as "isUndoneAtRequestTime"
    from price_change_batches where id = ${batchId}
  `;
  expect(batch?.isUndoneAtRequestTime).toBe(true);

  const replay = await repository().undo(
    undo({ merchantId: undoing.merchantId, batchId, key: "undo", expectedRevision: 1, at }),
  );
  expect(replay).toEqual({ ...result, kind: "replayed" });
});

test("[MER-11:db] rejects an undo after the ten-minute window without touching prices", async () => {
  const batchId = await applyTenPercent(expiring);
  const at = new Date(now.getTime() + tenMinutesMs + 1);
  const result = await repository().undo(
    undo({ merchantId: expiring.merchantId, batchId, key: "late", expectedRevision: 1, at }),
  );
  expect(result).toEqual({ kind: "undo_window_expired" });
  expect(await readPrices(expiring)).toEqual([550, 1_320]);
});

test("[MER-11:db] rejects an undo when a price changed after the apply", async () => {
  const batchId = await applyTenPercent(changedSince);
  await database.get().sql`update items set price_dzd = 600 where id = ${changedSince.firstItem}`;
  const result = await repository().undo(
    undo({ merchantId: changedSince.merchantId, batchId, key: "changed", expectedRevision: 1 }),
  );
  expect(result).toEqual({ kind: "price_changed_since_apply" });
  expect(await readPrices(changedSince)).toEqual([600, 1_320]);
});

test("[MER-11:db] rejects a second undo of the same batch under a new key", async () => {
  const batchId = await applyTenPercent(undoneTwice);
  const merchantId = undoneTwice.merchantId;
  const first = await repository().undo(
    undo({ merchantId, batchId, key: "first", expectedRevision: 1 }),
  );
  expect(first).toMatchObject({ kind: "applied", revision: 2 });
  const second = await repository().undo(
    undo({ merchantId, batchId, key: "second", expectedRevision: 2 }),
  );
  expect(second).toEqual({ kind: "price_change_already_undone" });
  expect(await readPrices(undoneTwice)).toEqual([500, 1_200]);
});

test("[MER-11:db] hides another merchant's batch and denies staff undo", async () => {
  const [batch] = await database.get().sql<{ id: string }[]>`
    select id from price_change_batches where merchant_id = ${undoing.merchantId}
  `;
  if (!batch) throw new Error("Expected the undo fixture batch to exist.");
  const foreignUndo = await repository().undo(
    undo({
      merchantId: foreign.merchantId,
      batchId: batch.id,
      key: "foreign",
      expectedRevision: 0,
    }),
  );
  expect(foreignUndo).toEqual({ kind: "not_found" });

  const staffUndo = await repository().undo(
    undo({
      merchantId: staffed.merchantId,
      batchId: batch.id,
      key: "staff",
      expectedRevision: 0,
      accountId: staffId,
    }),
  );
  expect(staffUndo).toEqual({ kind: "not_found" });
});
