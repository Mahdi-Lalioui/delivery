import { createHmac, randomBytes, randomUUIDv7 } from "node:crypto";
import { openDatabase, type DatabaseConnection } from "@zaafran/db/database";
import { seedGeography } from "@zaafran/db/geography";
import { migrateDatabase } from "@zaafran/db/migrate";
import { createTestClone } from "../../../packages/db/test/clone.ts";
import { sealTotpSecret } from "../src/auth-totp.ts";
import type { startApi } from "../src/start.ts";
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

export async function startAuthHarness(webOrigin: string): Promise<AuthHarness> {
  const compiled: unknown = await import(new URL("../dist/start.js", import.meta.url).href);
  if (!isCompiledApi(compiled)) throw new Error("Build the API before running browser auth tests.");
  await using resources = new AsyncDisposableStack();
  const clone = await createTestClone(process.env.DATABASE_URL_TEST ?? defaultTestUrl, "template0");
  resources.defer(clone.drop);
  const database = openDatabase(clone.url);
  resources.defer(() => database.close());
  await migrateDatabase(database);

  const proxy = await startAuthProxy(webOrigin);
  resources.defer(proxy.close);
  const totpKey = randomBytes(32);
  const sms = new Map<string, string>();
  let time = Date.now();
  const api = await compiled.startApi({
    environment: {
      DATABASE_URL: clone.url,
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
    seedMenuMemberships: (phone) => seedMenuMemberships(database, phone, new Date(time)),
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
