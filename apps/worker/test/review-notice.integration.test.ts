import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMerchantRepository } from "@zaafran/db/merchant";
import { createLocalMediaStore } from "@zaafran/media";
import { runOnce } from "graphile-worker";
import { beforeAll, expect, test } from "vitest";
import { registerTestDatabase } from "../../../packages/db/test/database.ts";
import { migrateWorker } from "../src/migrate-worker.ts";
import { createWorkerOptions } from "../src/runtime.ts";
import { createFakeSmsOutbox, type SmsSender } from "../src/sms.ts";

const database = registerTestDatabase();
const now = new Date("2026-11-16T09:00:00.000Z");
const communeId = fixtureId(1);
const noticeText = "Nouvelle demande de restaurant à examiner : /fr/admin/merchant-applications";
// The notice never touches photos, so the store root is never created.
const media = {
  store: createLocalMediaStore({ root: join(tmpdir(), "zaafran-notice-unused") }),
  maxPixels: 1,
};

function fixtureId(serial: number): string {
  return `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

beforeAll(async () => {
  await migrateWorker(database.url());
  const { sql } = database.get();
  await sql`
    INSERT INTO wilayas (code, name_ar, name_fr)
    VALUES (16, 'ولاية تجريبية', 'Wilaya de test') ON CONFLICT (code) DO NOTHING
  `;
  await sql`
    INSERT INTO communes (id, code, wilaya_code, name_ar, name_fr, centroid, boundary)
    SELECT ${communeId}, '1696', 16, 'بلدية تجريبية', 'Commune de test',
      ST_Centroid(shape)::geography, shape
    FROM (SELECT ST_Multi(ST_MakeEnvelope(3.04, 36.75, 3.06, 36.78, 4326)) AS shape) AS area
  `;
});

async function account(serial: number, flags: { isAdmin?: boolean; isBlocked?: boolean } = {}) {
  const id = fixtureId(serial);
  const phone = `+2135${String(serial).padStart(8, "0")}`;
  const { sql } = database.get();
  const blockedAt = flags.isBlocked === true ? now.toISOString() : null;
  await sql`
    INSERT INTO users (id, phone_e164, created_at, blocked_at)
    VALUES (${id}, ${phone}, ${now.toISOString()}::timestamptz, ${blockedAt}::timestamptz)
  `;
  if (flags.isAdmin === true) {
    await sql`
      INSERT INTO admins (user_id, totp_secret_encrypted)
      VALUES (${id}, ${hash(`fixture admin ${String(serial)}`)})
    `;
  }
  return { id, phone };
}

async function signUp(serial: number) {
  const owner = await account(serial);
  const input = {
    restaurantName: `Restaurant fictif ${String(serial)}`,
    ownerName: "Propriétaire de test",
    communeId,
    pin: { latitude: 36.765, longitude: 3.05 },
    cuisines: ["algerian"],
  };
  const result = await createMerchantRepository(database.get()).submitApplication({
    accountId: owner.id,
    input,
    now,
    idempotencyKeyHash: hash(`fixture-notice-key-${String(serial)}`),
    requestHash: hash(JSON.stringify(input)),
  });
  if (result.kind !== "created") throw new Error(`Expected a signup, got ${result.kind}`);
  return { merchantId: result.merchantId, owner, input };
}

async function noticeEffects(merchantId: string) {
  const rows = await database.get().sql<{ effectKey: string }[]>`
    SELECT effect_key AS "effectKey" FROM public.job_effects
    WHERE task_identifier = 'merchant.review_notice' AND effect_key LIKE ${`${merchantId}:%`}
    ORDER BY effect_key
  `;
  return rows.map(({ effectKey }) => effectKey);
}

function workerOptions(sms: SmsSender) {
  return createWorkerOptions(database.url(), database.get(), { media, sms });
}

test("[MER-01:worker] a signup sends each active admin one French notice without applicant data", async () => {
  const first = await account(100, { isAdmin: true });
  const second = await account(101, { isAdmin: true });
  await account(102, { isAdmin: true, isBlocked: true });
  const outbox = createFakeSmsOutbox();
  const { merchantId, owner, input } = await signUp(110);

  await runOnce({ ...workerOptions(outbox.sender), noHandleSignals: true });
  const { sql } = database.get();
  await sql`
    SELECT graphile_worker.add_job(
      'merchant.review_notice', json_build_object('merchantId', ${merchantId}::uuid)
    )
  `;
  await runOnce({ ...workerOptions(outbox.sender), noHandleSignals: true });

  const sent = outbox.read();
  expect(sent).toEqual([first.phone, second.phone].map((phone) => ({ phone, text: noticeText })));
  for (const { text } of sent) {
    for (const secret of [input.restaurantName, input.ownerName, owner.phone, merchantId]) {
      expect(text).not.toContain(secret);
    }
  }
  expect(await noticeEffects(merchantId)).toEqual([
    `${merchantId}:${first.id}:sms`,
    `${merchantId}:${second.id}:sms`,
  ]);
  expect(await sql`SELECT id FROM graphile_worker.jobs`).toHaveLength(0);
});

test("[MER-01:worker] a retry after a failed send notifies only the admins still waiting", async () => {
  const { sql } = database.get();
  await sql`DELETE FROM admins`;
  const first = await account(200, { isAdmin: true });
  const second = await account(201, { isAdmin: true });
  const outbox = createFakeSmsOutbox();
  let isSecondDown = true;
  const flaky: SmsSender = {
    async send(message) {
      if (isSecondDown && message.phone === second.phone) throw new Error("fixture SMS outage");
      await outbox.sender.send(message);
    },
  };
  const { merchantId } = await signUp(210);
  const notify = workerOptions(flaky).taskList["merchant.review_notice"];

  await expect(notify({ merchantId })).rejects.toThrow(/fixture SMS outage/);
  expect(await noticeEffects(merchantId)).toEqual([`${merchantId}:${first.id}:sms`]);

  isSecondDown = false;
  await notify({ merchantId });
  await notify({ merchantId });

  expect(outbox.read()).toEqual([
    { phone: first.phone, text: noticeText },
    { phone: second.phone, text: noticeText },
  ]);
  expect(await noticeEffects(merchantId)).toEqual([
    `${merchantId}:${first.id}:sms`,
    `${merchantId}:${second.id}:sms`,
  ]);
});

test("[MER-01:worker] the notice payload must name one merchant", async () => {
  const notify = workerOptions(createFakeSmsOutbox().sender).taskList["merchant.review_notice"];
  await expect(notify({ merchantId: "not-a-uuid" })).rejects.toThrow();
  await expect(notify({ merchantId: fixtureId(1), extra: true })).rejects.toThrow();
});
