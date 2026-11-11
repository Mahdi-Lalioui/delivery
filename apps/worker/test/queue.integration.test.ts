import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { createLocalMediaStore } from "@zaafran/media";
import { once } from "node:events";
import { run, runOnce } from "graphile-worker";
import { expect, test, vi } from "vitest";
import { registerTestDatabase } from "../../../packages/db/test/database.ts";
import { migrateWorker } from "../src/migrate-worker.ts";
import { createWorkerOptions } from "../src/runtime.ts";

const database = registerTestDatabase();

test("[M0-7] the migrated queue processes duplicate watchdog jobs into one health check", async () => {
  const connection = database.get();
  const databaseUrl = database.url();
  await migrateWorker(databaseUrl);

  const [migration] = await connection.sql<{ revision: number }[]>`
    select max(id) as revision from graphile_worker.migrations
  `;
  expect(migration?.revision).toBe(20);

  const checkId = "654abdc4-6f5f-4e38-9a89-f1fd71d0db2a";
  for (let attempt = 0; attempt < 2; attempt++) {
    await connection.sql`
      select graphile_worker.add_job('ops.watchdog', json_build_object('checkId', ${checkId}::text))
    `;
  }

  await runOnce({ ...createWorkerOptions(databaseUrl, connection), noHandleSignals: true });

  expect(await connection.sql`select id from graphile_worker.jobs`).toHaveLength(0);
  const effects = await connection.sql`
    select effect_key from job_effects where task_identifier = 'ops.watchdog'
  `;
  expect([...effects]).toEqual([{ effect_key: checkId }]);
});

test("[M0-7] a graceful stop persists an in-progress watchdog job's completion", async () => {
  const connection = database.get();
  const checkId = "87364915-64d1-49af-af73-4818c0dfc824";
  const runner = await run({
    ...createWorkerOptions(database.url(), connection),
    noHandleSignals: true,
  });
  let stopped: Promise<void> | undefined;

  try {
    await connection.sql.begin(async (transaction) => {
      await transaction`lock table public.job_effects in access exclusive mode`;
      await Promise.all([
        once(runner.events, "job:start", { signal: AbortSignal.timeout(3_000) }),
        connection.sql`
          select graphile_worker.add_job(
            'ops.watchdog', json_build_object('checkId', ${checkId}::text)
          )
        `,
      ]);
      stopped = runner.stop();
    });
  } finally {
    await (stopped ?? runner.stop());
    await runner.promise;
  }

  const effects = await connection.sql`
    select effect_key from public.job_effects where effect_key = ${checkId}
  `;
  expect([...effects]).toEqual([{ effect_key: checkId }]);
  expect(await connection.sql`select id from graphile_worker.jobs`).toHaveLength(0);
});

test("[SRCH-04:job] Graphile refreshes a changed restaurant from the durable search queue", async () => {
  const connection = database.get();
  const databaseUrl = database.url();
  await migrateWorker(databaseUrl);
  await connection.sql`
    INSERT INTO public.wilayas (code, name_ar, name_fr)
    VALUES (16, 'الجزائر', 'Alger') ON CONFLICT DO NOTHING
  `;
  const [commune] = await connection.sql<{ id: string }[]>`
    INSERT INTO public.communes (code, wilaya_code, name_ar, name_fr, centroid)
    VALUES ('1699', 16, 'تجريبي', 'Test', ST_SetSRID(ST_MakePoint(3, 36), 4326))
    RETURNING id
  `;
  if (!commune) throw new Error("Expected a synthetic commune.");
  const [merchant] = await connection.sql<{ id: string }[]>`
    INSERT INTO public.merchants (slug, restaurant_name, owner_name, phone_e164, commune_id,
      location, cuisines, status, created_at)
    VALUES ('test-casbah', 'Table de la Casbah', 'Synthetic owner', '+213500000000',
      ${commune.id}, ST_SetSRID(ST_MakePoint(3, 36), 4326), ARRAY['algerian'], 'active', now())
    RETURNING id
  `;
  if (!merchant) throw new Error("Expected a synthetic restaurant.");
  await connection.sql`SELECT graphile_worker.add_job('search_refresh', '{}'::json)`;
  const worker = createWorkerOptions(databaseUrl, connection);
  expect(worker.crontab).toContain("* * * * * search_refresh");
  await runOnce({ ...worker, noHandleSignals: true });
  expect(
    await connection.sql`SELECT merchant_id FROM public.search_document_refreshes`,
  ).toHaveLength(0);
  expect(
    await connection.sql`
    SELECT merchant_id FROM public.search_documents WHERE merchant_id = ${merchant.id}
  `,
  ).toEqual([{ merchant_id: merchant.id }]);
});

test("[CUS-24:job] the retention worker clears expired deletion secrets without customer traffic", async () => {
  const connection = database.get();
  const { sql } = connection;
  const databaseUrl = database.url();
  await migrateWorker(databaseUrl);
  const [account] = await sql<{ id: string }[]>`
    INSERT INTO users (phone_e164, created_at)
    VALUES ('+213500000256', now() - interval '2 days') RETURNING id
  `;
  if (!account) throw new Error("Missing synthetic account");
  const challengeId = "01932f18-3150-7c33-8a7a-53acfd343010";
  const hash = Buffer.alloc(32, 7);
  await sql`
    INSERT INTO account_deletion_challenges (id, user_id, ip_hash, key_hash, code_hmac, requested_at, expires_at)
    VALUES (${challengeId}, ${account.id}, ${hash}, ${hash}, ${hash}, now() - interval '1 hour', now() - interval '55 minutes')
  `;
  const worker = createWorkerOptions(databaseUrl, connection);
  expect(worker.crontab).toContain("*/5 * * * * privacy_cleanup");
  await sql`SELECT graphile_worker.add_job('privacy_cleanup',
    json_build_object('_cron', json_build_object('ts', ${new Date().toISOString()}::text, 'backfilled', false)))`;
  await runOnce({ ...worker, noHandleSignals: true });
  expect(
    await sql`SELECT key_hash, code_hmac FROM account_deletion_challenges WHERE id = ${challengeId}`,
  ).toEqual([{ key_hash: null, code_hmac: null }]);
});

test("[NOT-01][NOT-02] the worker sends a localized terminal SMS once per order event", async () => {
  const connection = database.get();
  const { sql } = connection;
  await migrateWorker(database.url());
  const orderId = randomUUID();
  const quoteId = randomUUID();
  await sql`
    INSERT INTO public.wilayas (code, name_ar, name_fr)
    VALUES (16, 'الجزائر', 'Alger') ON CONFLICT DO NOTHING
  `;
  await sql`
    WITH account AS (
      INSERT INTO users (phone_e164, created_at) VALUES ('+213500000258', now()) RETURNING id
    ), commune AS (
      INSERT INTO communes (code, wilaya_code, name_ar, name_fr, centroid)
      VALUES ('1698', 16, 'تجريبي', 'Test', ST_GeogFromText('SRID=4326;POINT(3 36)')) RETURNING id
    ), merchant AS (
      INSERT INTO merchants (slug, restaurant_name, owner_name, phone_e164, commune_id,
        location, cuisines, status, created_at)
      SELECT 'fixture-sms', 'Test', 'Synthetic owner', '+213500000000', id,
        ST_GeogFromText('SRID=4326;POINT(3 36)'), ARRAY['algerian'], 'active', now()
      FROM commune RETURNING id
    )
    INSERT INTO orders (
      id, quote_id, customer_id, merchant_id, restaurant_name, short_code, order_day, status,
      fulfilment, version, placed_at, last_event_at, subtotal_dzd, delivery_fee_dzd, total_dzd,
      paying_with_dzd, lines, customer_locale
    )
    SELECT ${orderId}, ${quoteId}, account.id, merchant.id, 'Test', 'AAA-222', current_date,
      'expired', 'pickup', 2, now(), now(), 1000, 0, 1000, 1000, '[]', 'en'
    FROM account, merchant
  `;
  await sql`
    INSERT INTO order_events (order_id, version, from_status, to_status, actor_kind, payload, occurred_at)
    VALUES (${orderId}, 2, 'pending_acceptance', 'expired', 'system', '{"kind":"expire"}', now())
  `;
  await sql`
    SELECT graphile_worker.add_job('order.sms', json_build_object('orderId', ${orderId}::uuid, 'version', 2))
    FROM generate_series(1, 2)
  `;
  const orderSms = vi
    .fn<(message: { recipient: string; key: string; text: string }) => Promise<void>>()
    .mockResolvedValue(undefined);
  const worker = createWorkerOptions(database.url(), connection, {
    store: createLocalMediaStore({ root: tmpdir() }),
    orderSms,
  });
  await runOnce({ ...worker, noHandleSignals: true });
  expect(orderSms).toHaveBeenCalledExactlyOnceWith({
    recipient: "+213500000258",
    key: "order:sms:" + orderId + ":2",
    text: "AWID · Order expired · AAA-222",
  });
});
