import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createHmac, randomBytes, randomUUIDv7 } from "node:crypto";
import { openDatabase, type DatabaseConnection } from "@zaafran/db/database";
import { seedGeography } from "@zaafran/db/geography";
import { migrateDatabase } from "@zaafran/db/migrate";
import { createTestClone } from "../../../packages/db/test/clone.ts";
import { sealTotpSecret } from "../src/auth-totp.ts";
import type { startApi } from "../src/start.ts";
import { seedDiscoveryFeed } from "./e2e-discovery-feed.ts";
import { startAuthProxy } from "./e2e-auth-proxy.ts";
import type { AlgiersCommune, AuthHarness, MenuMembershipFixture } from "./e2e-auth-types.ts";

const defaultTestUrl = "postgresql://zaafran:zaafran_dev_only@127.0.0.1:5432/zaafran_test";

function isCompiledApi(module: unknown): module is { startApi: typeof startApi } {
  return (
    typeof module === "object" &&
    module !== null &&
    "startApi" in module &&
    typeof module.startApi === "function"
  );
}

function currentTotp(secret: Buffer, time: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30_000)));
  const digest = createHmac("sha1", secret).update(counter).digest();
  const offset = digest.readUInt8(digest.length - 1) & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, "0");
}

async function seedAlgiersCommune(database: DatabaseConnection): Promise<AlgiersCommune> {
  await seedGeography(database);
  const [commune] = await database.sql<AlgiersCommune[]>`
    WITH selected AS (
      SELECT id, name_ar, name_fr, ST_PointOnSurface(boundary) AS interior
      FROM public.communes WHERE code = '1601' AND wilaya_code = 16 AND boundary IS NOT NULL
    )
    SELECT id, name_ar AS "nameAr", name_fr AS "nameFr",
      jsonb_build_object('latitude', ST_Y(interior), 'longitude', ST_X(interior)) AS pin
    FROM selected
  `;
  if (!commune) throw new Error("The Algiers centre test commune has no boundary.");
  return commune;
}

const menuFixtureNames = {
  owner: "Table fictive du propriétaire",
  manager: "Table fictive du responsable",
  staff: "Table fictive de l’équipe",
} as const;

async function seedMenuMemberships(database: DatabaseConnection, phone: string, time: Date) {
  const { id: communeId, pin } = await seedAlgiersCommune(database);
  const createdAt = time.toISOString();
  return database.sql.begin(async (sql) => {
    const [account] = await sql<{ id: string }[]>`
      SELECT id FROM public.users WHERE phone_e164 = ${phone}
      AND blocked_at IS NULL AND deleted_at IS NULL
    `;
    if (!account) throw new Error("Sign in the synthetic account before seeding its memberships.");

    const fixtures: MenuMembershipFixture[] = [];
    for (const role of ["owner", "manager", "staff"] as const) {
      const merchantId = randomUUIDv7();
      const restaurantName = menuFixtureNames[role];
      await sql`
        INSERT INTO public.merchants
          (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location,
           cuisines, status, created_at, reviewed_at, is_demo)
        VALUES (${merchantId}, ${"menu-fixture-" + merchantId}, ${restaurantName}, 'Synthetic owner',
          ${phone}, ${communeId}, ST_SetSRID(ST_MakePoint(${pin.longitude}, ${pin.latitude}), 4326)::geography,
          ARRAY['algerian'], 'approved', ${createdAt}, ${createdAt}, true)
      `;
      await sql`
        INSERT INTO public.merchant_members (merchant_id, user_id, role)
        VALUES (${merchantId}, ${account.id}, ${role})
      `;
      fixtures.push({ merchantId, restaurantName, role });
    }
    return fixtures;
  });
}

async function seedDiscoverySearch(database: DatabaseConnection) {
  const commune = await seedAlgiersCommune(database);
  await database.sql.begin(async (sql) => {
    const [merchant] = await sql<{ id: string }[]>`
      INSERT INTO public.merchants (slug, restaurant_name, owner_name, phone_e164, commune_id,
        location, cuisines, status, created_at)
      VALUES ('chawarma-fixture', 'Chawarma du Port', 'Synthetic owner', '+213500000000',
        ${commune.id}, ST_SetSRID(ST_MakePoint(${commune.pin.longitude}, ${commune.pin.latitude}), 4326),
        ARRAY['grill'], 'active', now()) RETURNING id
    `;
    if (!merchant) throw new Error("Expected a synthetic search merchant.");
    const [category] = await sql<{ id: string }[]>`
      INSERT INTO public.categories (merchant_id, names, sort)
      VALUES (${merchant.id}, '{"fr":"Grillades"}', 0) RETURNING id
    `;
    if (!category) throw new Error("Expected a synthetic search category.");
    await sql`
      INSERT INTO public.items (merchant_id, category_id, names, descriptions, price_dzd, tags,
        prep_extra_min, moderation_status)
      VALUES (${merchant.id}, ${category.id}, '{"ar":"شاورما الدجاج","fr":"Chawarma poulet"}',
        '{"fr":"Poulet et salade"}', 500, '{}', 0, 'approved')
    `;
    await sql`SELECT graphile_worker.add_job('search_refresh', '{}'::json)`;
  });
}

async function seedOnboardingProgress(
  database: DatabaseConnection,
  merchantId: string,
): Promise<void> {
  await database.sql.begin(async (sql) => {
    const [fixture] = await sql<{ id: string }[]>`
      SELECT id FROM public.merchants WHERE id = ${merchantId} AND is_demo AND status = 'approved'
    `;
    if (!fixture) throw new Error("The checklist requires an approved synthetic merchant.");
    await sql`
      INSERT INTO public.merchant_hours (merchant_id, weekday, opens_minute, closes_minute)
      VALUES (${fixture.id}, 5, 1080, 120)
    `;
    await sql`
      WITH category AS (
        INSERT INTO public.categories (merchant_id, names, sort)
        VALUES (${fixture.id}, '{"ar":"أطباق تجريبية","fr":"Plats fictifs"}', 0) RETURNING id
      )
      INSERT INTO public.items
        (merchant_id, category_id, names, descriptions, price_dzd, tags, prep_extra_min)
      SELECT ${fixture.id}::uuid, category.id,
        jsonb_build_object('ar', 'طبق تجريبي ' || item.number::text,
                           'fr', 'Plat fictif ' || item.number::text),
        '{"ar":"وصف تجريبي","fr":"Description fictive"}'::jsonb, 600, ARRAY[]::text[], 0
      FROM category CROSS JOIN generate_series(1, 5) AS item(number)
    `;
  });
}

async function startTestMediaWorker(resources: AsyncDisposableStack, databaseUrl: string) {
  const root = await mkdtemp(join(tmpdir(), "zaafran-e2e-media-"));
  resources.defer(() => rm(root, { recursive: true, force: true }));
  const workerDist = new URL("../../worker/dist/", import.meta.url);
  const environment = { DATABASE_URL: databaseUrl, MEDIA_STORAGE_ROOT: root };
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL("migrate.js", workerDist))], {
    env: environment,
  });
  const child = spawn(process.execPath, [fileURLToPath(new URL("worker.js", workerDist))], {
    env: environment,
    stdio: "ignore",
  });
  const closed = new Promise<void>((resolve) => {
    child.once("close", () => {
      resolve();
    });
  });
  resources.defer(async () => {
    child.kill("SIGTERM");
    await closed;
  });
  await once(child, "spawn");
  return root;
}

export async function startAuthHarness(
  webOrigin: string,
  withMediaWorker = false,
): Promise<AuthHarness> {
  const compiled: unknown = await import(new URL("../dist/start.js", import.meta.url).href);
  if (!isCompiledApi(compiled)) throw new Error("Build the API before running browser auth tests.");
  await using resources = new AsyncDisposableStack();
  const clone = await createTestClone(process.env.DATABASE_URL_TEST ?? defaultTestUrl, "template0");
  resources.defer(clone.drop);
  const database = openDatabase(clone.url);
  resources.defer(() => database.close());
  await migrateDatabase(database);
  const mediaRoot = withMediaWorker ? await startTestMediaWorker(resources, clone.url) : undefined;

  const proxy = await startAuthProxy(webOrigin);
  resources.defer(proxy.close);
  const totpKey = randomBytes(32);
  const sms = new Map<string, string>();
  const invitations = new Map<string, string>();
  let time = Date.now();
  const api = await compiled.startApi({
    environment: {
      DATABASE_URL: clone.url,
      ...(mediaRoot === undefined ? {} : { MEDIA_STORAGE_ROOT: mediaRoot }),
      API_HOST: "127.0.0.1",
      API_PORT: "0",
      AUTH_PUBLIC_ORIGIN: proxy.origin,
      AUTH_OTP_KEY: randomBytes(32).toString("hex"),
      AUTH_TOTP_KEY: totpKey.toString("hex"),
    },
    now: () => new Date(time),
    sendSms({ phone, code }) {
      sms.set(phone, code);
    },
    sendInvitation({ phone, token }) {
      invitations.set(phone, token);
    },
  });
  resources.defer(() => api.close());
  const address = api.server.address();
  if (!address || typeof address === "string") throw new Error("The test API has no TCP address.");
  proxy.connectApi(address.port);

  const cleanup = resources.move();
  return {
    origin: proxy.origin,
    close: () => cleanup.disposeAsync(),
    seedAlgiersCommune: () => seedAlgiersCommune(database),
    seedDiscoverySearch: () => seedDiscoverySearch(database),
    async seedDiscoveryFeed() {
      if (!mediaRoot) throw new Error("Start the test media worker for the discovery fixture.");
      return seedDiscoveryFeed(database, {
        root: mediaRoot,
        commune: await seedAlgiersCommune(database),
        now: new Date(time),
      });
    },
    seedMenuMemberships: (phone) => seedMenuMemberships(database, phone, new Date(time)),
    seedOnboardingProgress: (merchantId) => seedOnboardingProgress(database, merchantId),
    advanceClock(milliseconds: number) {
      if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
        throw new RangeError("The test clock can only advance by whole milliseconds.");
      }
      time += milliseconds;
    },
    latestSms(phone: string) {
      const code = sms.get(phone);
      if (code === undefined) throw new Error("No SMS was sent to the synthetic test number.");
      return code;
    },
    latestInvitation(phone: string) {
      const token = invitations.get(phone);
      if (token === undefined) throw new Error("No invitation was sent to the synthetic number.");
      return token;
    },
    async phoneForSession(sessionId: string) {
      const [user] = await database.sql<{ phone: string }[]>`
        SELECT users.phone_e164 AS phone FROM sessions
        JOIN users ON users.id = sessions.user_id WHERE sessions.id = ${sessionId}
      `;
      return user?.phone;
    },
    async seedAdmin(phone: string) {
      const userId = randomUUIDv7();
      const secret = randomBytes(20);
      const sealed = sealTotpSecret({ key: totpKey, userId, secret });
      await database.sql.begin(async (sql) => {
        await sql`INSERT INTO users (id, phone_e164, created_at)
          VALUES (${userId}, ${phone}, ${new Date(time).toISOString()}::timestamptz)`;
        await sql`INSERT INTO admins (user_id, totp_secret_encrypted) VALUES (${userId}, ${sealed})`;
      });
      return () => currentTotp(secret, time);
    },
  };
}
