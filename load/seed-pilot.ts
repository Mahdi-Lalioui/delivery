import { randomUUID } from "node:crypto";
import { open, rm } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { createSessionToken } from "../apps/api/src/auth-crypto.ts";
import { openDatabase, type DatabaseConnection } from "../packages/db/src/database.ts";
import { createOrderQuoteRepository } from "../packages/db/src/order-quotes.ts";

const latitude = 36.75;
const longitude = 3.06;
const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const batchSize = 500;

function actor() {
  const { token, tokenHash } = createSessionToken();
  const id = randomUUID();
  return {
    id,
    email: id + "@load.invalid",
    tokenHash: tokenHash.toString("hex"),
    sessionCookie: "__Host-session=" + token,
  };
}

type Actor = ReturnType<typeof actor>;

async function addActors(sql: DatabaseConnection["sql"], actors: Actor[]) {
  const rows = JSON.stringify(actors.map(({ id, email, tokenHash }) => ({ id, email, tokenHash })));
  await sql`
    WITH actors AS (
      SELECT * FROM jsonb_to_recordset(${rows}::jsonb) AS a(id uuid, email text, "tokenHash" text)
    ), inserted AS (
      INSERT INTO public.users (id, email, created_at)
      SELECT id, email, now() FROM actors RETURNING id
    )
    INSERT INTO public.sessions
      (id, user_id, token_hash, transport, kind, device_name, request_ip, created_at, last_seen_at, expires_at)
    SELECT gen_random_uuid(), inserted.id, decode(actors."tokenHash", 'hex'), 'web', 'standard',
      'Synthetic load fixture', '192.0.2.15', now(), now(), now() + interval '1 hour'
    FROM inserted JOIN actors USING (id)
  `;
}

async function seedCatalog(sql: DatabaseConnection["sql"]) {
  const merchantId = randomUUID();
  const categoryId = randomUUID();
  const itemId = randomUUID();
  await sql`
    INSERT INTO public.wilayas (code, name_ar, name_fr)
    VALUES (16, 'الجزائر', 'Alger') ON CONFLICT (code) DO NOTHING
  `;
  const [commune] = await sql<{ id: string }[]>`
    INSERT INTO public.communes (code, wilaya_code, name_ar, name_fr, centroid)
    VALUES ('1699', 16, 'تجريبي', 'Synthétique', ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography)
    ON CONFLICT (code) DO NOTHING RETURNING id
  `;
  const communeId =
    commune?.id ??
    (
      await sql<{ id: string }[]>`
    SELECT id FROM public.communes WHERE code = '1699'
  `
    )[0]?.id;
  if (!communeId) throw new Error("Missing synthetic commune");
  await sql`
    INSERT INTO public.merchants (id, slug, restaurant_name, owner_name, phone_e164, commune_id,
      location, cuisines, status, created_at)
    VALUES (${merchantId}, ${"load-" + merchantId}, 'Synthetic restaurant', 'Synthetic owner',
      '+213500000021', ${communeId},
      ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
      ARRAY['algerian'], 'active', now())
  `;
  await sql`
    INSERT INTO public.merchant_hours (merchant_id, weekday, opens_minute, closes_minute)
    SELECT ${merchantId}, day, 0, 1440 FROM generate_series(0, 6) AS day
  `;
  await sql`INSERT INTO public.categories (id, merchant_id, names, sort)
    VALUES (${categoryId}, ${merchantId}, '{"fr":"Plats"}', 0)`;
  await sql`INSERT INTO public.items (id, merchant_id, category_id, names, descriptions, price_dzd, tags, prep_extra_min)
    VALUES (${itemId}, ${merchantId}, ${categoryId}, '{"fr":"Couscous"}', '{"fr":"Légumes"}', 500, '{}', 0)`;
  await sql`INSERT INTO public.merchant_order_settings (merchant_id, pickup_enabled, delivery_enabled)
    VALUES (${merchantId}, true, true)`;
  return { merchantId, itemId };
}

function shortCode(index: number) {
  const digits = Array.from({ length: 6 }, (_, place) =>
    codeAlphabet.charAt(Math.floor(index / codeAlphabet.length ** place) % codeAlphabet.length),
  ).join("");
  return digits.slice(0, 3) + "-" + digits.slice(3);
}

async function seedPlacements(sql: DatabaseConnection["sql"], templateId: string, count: number) {
  const placements = [];
  for (let offset = 0; offset < count; offset += batchSize) {
    const batch = Array.from({ length: Math.min(batchSize, count - offset) }, () => ({
      ...actor(),
      quoteId: randomUUID(),
    }));
    await addActors(sql, batch);
    const rows = JSON.stringify(batch.map(({ id, quoteId }) => ({ id, quoteId })));
    await sql`
      INSERT INTO public.quotes (id, customer_id, merchant_id, input, payload_hash, breakdown, created_at, expires_at)
      SELECT a."quoteId", a.id, q.merchant_id, q.input, q.payload_hash, q.breakdown, now(), now() + interval '10 minutes'
      FROM public.quotes q CROSS JOIN jsonb_to_recordset(${rows}::jsonb) AS a(id uuid, "quoteId" uuid)
      WHERE q.id = ${templateId}
    `;
    placements.push(
      ...batch.map(({ sessionCookie, quoteId }) => ({
        sessionCookie,
        quoteId,
        contactPhone: "+213500000022",
      })),
    );
  }
  return placements;
}

async function seedCouriers(
  sql: DatabaseConnection["sql"],
  { merchantId, customerId }: { merchantId: string; customerId: string },
  count: number,
) {
  const couriers = [];
  for (let offset = 0; offset < count; offset += batchSize) {
    const batch = Array.from({ length: Math.min(batchSize, count - offset) }, (_, index) => ({
      ...actor(),
      courierId: randomUUID(),
      orderId: randomUUID(),
      shortCode: shortCode(offset + index),
    }));
    await addActors(sql, batch);
    const rows = JSON.stringify(
      batch.map(({ id, courierId, orderId, shortCode }) => ({
        id,
        courierId,
        orderId,
        shortCode,
      })),
    );
    await sql`
      WITH fixtures AS (
        SELECT * FROM jsonb_to_recordset(${rows}::jsonb) AS a(id uuid, "courierId" uuid, "orderId" uuid, "shortCode" text)
      ), inserted AS (
        INSERT INTO public.couriers (id, user_id, merchant_id, display_name, active, created_at)
        SELECT "courierId", id, ${merchantId}, 'Synthetic courier', true, now() FROM fixtures RETURNING id
      )
      INSERT INTO public.orders (
        id, quote_id, customer_id, merchant_id, restaurant_name, short_code, order_day, status, fulfilment,
        version, placed_at, last_event_at, courier_id, address_snapshot, subtotal_dzd, delivery_fee_dzd,
        total_dzd, paying_with_dzd, lines
      )
      SELECT "orderId", gen_random_uuid(), ${customerId}, ${merchantId}, 'Synthetic restaurant', "shortCode",
        current_date, 'out_for_delivery', 'delivery', 5, now() - interval '1 minute', now(),
        inserted.id, '{"pin":{"latitude":36.75,"longitude":3.06},"communeId":null,"plusCode":"8F62+22","landmark":"Synthetic landmark"}'::jsonb,
        500, 100, 600, 600, '[]'::jsonb
      FROM fixtures JOIN inserted ON inserted.id = fixtures."courierId"
    `;
    couriers.push(
      ...batch.map(({ sessionCookie, orderId }) => ({
        sessionCookie,
        orderId,
        latitude,
        longitude,
        accuracyM: 10,
        heading: 45,
      })),
    );
  }
  return couriers;
}

function readCount(value: string | undefined, defaultCount: number) {
  const count = Number(value ?? defaultCount);
  if (!Number.isSafeInteger(count) || count < 1 || count > defaultCount) {
    throw new Error("Fixture counts must be positive integers within the pilot target");
  }
  return count;
}

async function main() {
  const url = new URL(process.env.LOAD_DATABASE_URL ?? "");
  const filePath = process.env.LOAD_FIXTURES_FILE ?? "";
  const placementsCount = readCount(process.env.LOAD_PLACEMENT_FIXTURES, 30_000);
  const couriersCount = readCount(process.env.LOAD_COURIER_FIXTURES, 1_000);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) ||
    !/^\/awid_load_[a-z0-9_]+$/u.test(url.pathname) ||
    url.search ||
    !isAbsolute(filePath)
  ) {
    throw new Error(
      "Use a migrated disposable loopback awid_load_* database and absolute output path",
    );
  }

  const file = await open(filePath, "wx", 0o600);
  const database = openDatabase(url.href);
  let saved = false;
  try {
    const customer = actor();
    await addActors(database.sql, [customer]);
    const { merchantId, itemId } = await seedCatalog(database.sql);
    const result = await createOrderQuoteRepository(database).create({
      customerId: customer.id,
      input: {
        merchantId,
        fulfilment: "pickup",
        timing: { kind: "asap" },
        items: [{ itemId, quantity: 1, optionIds: [] }],
      },
      now: new Date(),
    });
    if (result.kind !== "quoted") throw new Error("Synthetic pickup quote did not validate");
    const couriers = await seedCouriers(
      database.sql,
      { merchantId, customerId: customer.id },
      couriersCount,
    );
    const placements = await seedPlacements(database.sql, result.quote.quoteId, placementsCount);
    await file.writeFile(JSON.stringify({ placements, couriers }));
    saved = true;
    process.stdout.write(
      "Synthetic placement and courier fixtures saved. Run promptly before quotes expire.\n",
    );
  } finally {
    await database.close();
    await file.close();
    if (!saved) await rm(filePath, { force: true });
  }
}

try {
  await main();
} catch {
  process.stderr.write(
    "Unable to seed the synthetic pilot fixtures. Check the disposable database and output path.\n",
  );
  process.exitCode = 1;
}
