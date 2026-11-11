import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import {
  createMerchantPromotionsRepository,
  type PromotionInput,
} from "../../src/promotions/repository.ts";
import { registerTestDatabase } from "../database.ts";

const database = registerTestDatabase();
const now = new Date("2026-11-08T14:00:00.000Z");

function fixtureId(serial: number) {
  return `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
}

const communeId = fixtureId(1);
const ownerId = fixtureId(2);
const managerId = fixtureId(3);
const staffId = fixtureId(4);
const blockedId = fixtureId(5);
const customerId = fixtureId(6);
const ownerMerchantId = fixtureId(11);
const otherMerchantId = fixtureId(12);
const replayMerchantId = fixtureId(13);
const fullMerchantId = fixtureId(14);
const statsMerchantId = fixtureId(15);
const existingPromotionId = fixtureId(20);
const redeemedPromotionId = fixtureId(25);

const fixed: PromotionInput = {
  activation: { kind: "code", code: "Déjeuner" },
  discount: { kind: "fixed", amountDzd: 200 },
  conditions: { minimumSubtotalDzd: 1000, maxUsesTotal: 100 },
};
const automatic: PromotionInput = {
  activation: { kind: "automatic" },
  discount: { kind: "free_delivery" },
  conditions: { firstOrderOnly: true },
};

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

function command(merchantId: string, input: PromotionInput, key: string) {
  return {
    accountId: ownerId,
    merchantId,
    input,
    now,
    idempotencyKeyHash: hash(key),
    requestHash: hash(JSON.stringify(input)),
  };
}

function updateCommand(merchantId: string, promotionId: string, input: PromotionInput) {
  return {
    ...command(merchantId, input, `update-${promotionId}`),
    promotionId,
    requestHash: hash(JSON.stringify({ promotionId, input })),
  };
}

beforeAll(async () => {
  const { sql } = database.get();
  await sql`INSERT INTO wilayas (code, name_ar, name_fr) VALUES (16, 'الجزائر', 'Alger')`;
  await sql`
    INSERT INTO communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    VALUES (${communeId}, '1699', 16, 'الجزائر', 'Alger',
      st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography)
  `;
  for (const [index, accountId] of [ownerId, managerId, staffId, blockedId, customerId].entries()) {
    await sql`
      INSERT INTO users (id, phone_e164, created_at, blocked_at)
      VALUES (${accountId}, ${`+21350000001${String(index)}`}, ${now.toISOString()},
        ${accountId === blockedId ? now.toISOString() : null})
    `;
  }
  for (const merchantId of [
    ownerMerchantId,
    otherMerchantId,
    replayMerchantId,
    fullMerchantId,
    statsMerchantId,
  ]) {
    await sql`
      INSERT INTO merchants (id, slug, restaurant_name, owner_name, phone_e164,
        commune_id, location, cuisines, status, created_at)
      VALUES (${merchantId}, ${`fixture-${merchantId}`}, 'Restaurant test', 'Propriétaire',
        '+213500000010', ${communeId}, st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography,
        array['algerian'], 'approved', ${now.toISOString()})
    `;
  }
  await sql`
    INSERT INTO merchant_members (merchant_id, user_id, role)
    VALUES (${ownerMerchantId}, ${ownerId}, 'owner'), (${ownerMerchantId}, ${managerId}, 'manager'),
      (${ownerMerchantId}, ${staffId}, 'staff'), (${ownerMerchantId}, ${blockedId}, 'manager'),
      (${otherMerchantId}, ${managerId}, 'owner'), (${replayMerchantId}, ${ownerId}, 'owner'),
      (${fullMerchantId}, ${ownerId}, 'owner'), (${statsMerchantId}, ${managerId}, 'manager')
  `;
  await sql`
    INSERT INTO promotions (id, merchant_id, discount, conditions, created_at, updated_at)
    VALUES (${existingPromotionId}, ${ownerMerchantId}, ${JSON.stringify(automatic.discount)}::jsonb,
      ${JSON.stringify(automatic.conditions)}::jsonb, ${now.toISOString()}, ${now.toISOString()}),
      (${redeemedPromotionId}, ${statsMerchantId}, ${JSON.stringify(automatic.discount)}::jsonb,
      ${JSON.stringify(automatic.conditions)}::jsonb, ${now.toISOString()}, ${now.toISOString()})
  `;
});

test("[MER-19:authz] denies staff, blocked accounts and foreign merchant access", async () => {
  const promotions = createMerchantPromotionsRepository(database.get());
  for (const accountId of [staffId, blockedId, customerId]) {
    expect(await promotions.list({ accountId, merchantId: ownerMerchantId })).toBeUndefined();
    expect(
      await promotions.create({ ...command(ownerMerchantId, fixed, "deny"), accountId }),
    ).toEqual({ kind: "not_found" });
    expect(
      await promotions.update({
        ...updateCommand(ownerMerchantId, existingPromotionId, fixed),
        accountId,
      }),
    ).toEqual({ kind: "not_found" });
  }
  expect(
    await promotions.list({ accountId: ownerId, merchantId: otherMerchantId }),
  ).toBeUndefined();
  expect(
    await promotions.update({
      ...updateCommand(otherMerchantId, existingPromotionId, fixed),
      accountId: managerId,
    }),
  ).toEqual({ kind: "not_found" });
});

test("[MER-19:db] shares case-insensitive code uniqueness across creates and updates within a merchant", async () => {
  const promotions = createMerchantPromotionsRepository(database.get());
  const padded: PromotionInput = { ...fixed, activation: { kind: "code", code: " Déjeuner " } };
  const create = await promotions.create(command(ownerMerchantId, padded, "lunch"));
  expect(create).toMatchObject({
    kind: "applied",
    promotion: {
      ...fixed,
      merchantId: ownerMerchantId,
      stats: { uses: 0, salesDzd: 0 },
    },
  });
  const duplicate: PromotionInput = { ...fixed, activation: { kind: "code", code: "DÉJEUNER" } };
  expect(await promotions.create(command(ownerMerchantId, duplicate, "duplicate"))).toEqual({
    kind: "duplicate_code",
  });
  expect(
    await promotions.update(updateCommand(ownerMerchantId, existingPromotionId, duplicate)),
  ).toEqual({ kind: "duplicate_code" });
  expect(
    await promotions.create({
      ...command(otherMerchantId, duplicate, "independent"),
      accountId: managerId,
    }),
  ).toMatchObject({ kind: "applied", promotion: { merchantId: otherMerchantId } });
  expect(
    await promotions.list({ accountId: managerId, merchantId: ownerMerchantId }),
  ).toMatchObject({
    promotions: [{ ...automatic, promotionId: existingPromotionId }, fixed],
  });
});

test("[MER-19:db] serializes concurrent writes and replays the exact response after later edits", async () => {
  const promotions = createMerchantPromotionsRepository(database.get());
  expect(await promotions.list({ accountId: ownerId, merchantId: replayMerchantId })).toEqual({
    promotions: [],
  });
  const create = command(replayMerchantId, fixed, "race");
  const responses = await Promise.all([promotions.create(create), promotions.create(create)]);
  const applied = responses.find(({ kind }) => kind === "applied");
  expect(applied).toBeDefined();
  if (!applied || !("promotion" in applied)) throw new Error("Expected a promotion");
  expect(responses).toContainEqual({ kind: "replayed", promotion: applied.promotion });
  const { promotionId } = applied.promotion;
  const update = updateCommand(replayMerchantId, promotionId, automatic);
  const updated = await promotions.update(update);
  expect(updated).toMatchObject({ kind: "applied", promotion: automatic });
  expect(
    await promotions.update({ ...update, ...command(replayMerchantId, fixed, "later") }),
  ).toMatchObject({ kind: "applied", promotion: fixed });
  expect(await promotions.update(update)).toEqual({ ...updated, kind: "replayed" });
  expect(await promotions.create(create)).toEqual({ ...applied, kind: "replayed" });
  expect(await promotions.create(command(replayMerchantId, automatic, "race"))).toEqual({
    kind: "idempotency_conflict",
  });
  expect(await promotions.list({ accountId: ownerId, merchantId: replayMerchantId })).toEqual({
    promotions: [applied.promotion],
  });
});

test("[MER-19:db] aggregates real redemption stats and preserves them on a settings replacement", async () => {
  const { sql } = database.get();
  await sql`
    INSERT INTO promotion_redemptions (promotion_id, order_id, customer_id, sales_dzd)
    VALUES (${redeemedPromotionId}, ${fixtureId(21)}, ${customerId}, 2147483647),
      (${redeemedPromotionId}, ${fixtureId(22)}, ${customerId}, 900)
  `;
  const promotions = createMerchantPromotionsRepository(database.get());
  const request = {
    ...updateCommand(statsMerchantId, redeemedPromotionId, fixed),
    accountId: managerId,
  };
  const expected = {
    ...fixed,
    promotionId: redeemedPromotionId,
    merchantId: statsMerchantId,
    stats: { uses: 2, salesDzd: 2_147_484_547 },
  };
  expect(await promotions.update(request)).toEqual({ kind: "applied", promotion: expected });
  expect(await promotions.list({ accountId: managerId, merchantId: statsMerchantId })).toEqual({
    promotions: [expected],
  });
  await sql`
    INSERT INTO promotion_redemptions (promotion_id, order_id, customer_id, sales_dzd)
    VALUES (${redeemedPromotionId}, ${fixtureId(23)}, ${customerId}, 500)
  `;
  expect(await promotions.update(request)).toEqual({ kind: "replayed", promotion: expected });
  expect(
    await promotions.list({ accountId: managerId, merchantId: statsMerchantId }),
  ).toMatchObject({ promotions: [{ stats: { uses: 3, salesDzd: 2_147_485_047 } }] });
});

test("[MER-19:db] admits one concurrent create at the list bound and keeps stable order", async () => {
  const { sql } = database.get();
  await sql`
    INSERT INTO promotions (id, merchant_id, discount, conditions, created_at, updated_at)
    SELECT uuidv7(), ${fullMerchantId}, '{"kind":"free_delivery"}'::jsonb,
      '{}'::jsonb, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz
    FROM generate_series(1, 99)
  `;
  const promotions = createMerchantPromotionsRepository(database.get());
  const results = await Promise.all([
    promotions.create(command(fullMerchantId, automatic, "a")),
    promotions.create(command(fullMerchantId, automatic, "b")),
  ]);
  expect(results.map(({ kind }) => kind).sort()).toEqual(["applied", "promotion_limit"]);
  const output = await promotions.list({ accountId: ownerId, merchantId: fullMerchantId });
  const ids = output?.promotions.map(({ promotionId }) => promotionId);
  expect(ids).toHaveLength(100);
  expect(ids).toEqual(ids?.toSorted());
});
