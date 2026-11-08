import { randomUUIDv7 } from "node:crypto";
import { onTestFinished } from "vitest";
import { registerTestDatabase } from "../../../packages/db/test/database.ts";
import { createSessionToken } from "../src/auth-crypto.ts";
import { startApi, type StartOptions } from "../src/start.ts";

const publicOrigin = "https://zaafran.test";

export function registerMerchantApiFixture(now: string) {
  const database = registerTestDatabase();

  async function openApi(
    clock: () => Date = () => new Date(now),
    sendInvitation?: StartOptions["sendInvitation"],
    mediaRoot?: string,
  ) {
    const api = await startApi({
      environment: {
        DATABASE_URL: database.url(),
        ...(mediaRoot === undefined ? {} : { MEDIA_STORAGE_ROOT: mediaRoot }),
        AUTH_PUBLIC_ORIGIN: publicOrigin,
        AUTH_OTP_KEY: Buffer.alloc(32, 19).toString("hex"),
        AUTH_TOTP_KEY: Buffer.alloc(32, 26).toString("hex"),
      },
      now: clock,
      ...(sendInvitation === undefined ? {} : { sendInvitation }),
      async listen(app) {
        await app.ready();
        return "http://127.0.0.1:3002";
      },
    });
    onTestFinished(() => api.close());
    return api;
  }

  async function seedActor(phone: string, kind: "standard" | "admin") {
    const { sql } = database.get();
    const userId = randomUUIDv7();
    const sessionId = randomUUIDv7();
    const { token, tokenHash } = createSessionToken();
    await sql`INSERT INTO users (id, phone_e164, created_at) VALUES (${userId}, ${phone}, ${now})`;
    if (kind === "admin") {
      await sql`INSERT INTO admins (user_id, totp_secret_encrypted) VALUES (${userId}, ${Buffer.alloc(32, 41)})`;
    }
    await sql`
      INSERT INTO sessions
        (id, user_id, token_hash, transport, kind, request_ip, created_at, last_seen_at, expires_at)
      VALUES (${sessionId}, ${userId}, ${tokenHash}, 'web', ${kind}, '192.0.2.1',
        ${now}, ${now}, ${now}::timestamptz + interval '1 day')
    `;
    return {
      userId,
      sessionId,
      headers: {
        cookie: "__Host-session=" + token,
        origin: publicOrigin,
        "sec-fetch-site": "same-origin",
      },
    };
  }

  async function seedMenuMerchants(userId: string, communeCode = "1602") {
    const { sql } = database.get();
    const communeId = randomUUIDv7();
    await sql`INSERT INTO wilayas (code, name_ar, name_fr)
      VALUES (16, 'الجزائر', 'Alger') ON CONFLICT (code) DO NOTHING`;
    await sql`
      INSERT INTO communes (id, code, wilaya_code, name_ar, name_fr, centroid)
      VALUES (${communeId}, ${communeCode}, 16, 'بلدية الاختبار', 'Commune fictive',
        ST_SetSRID(ST_MakePoint(3, 36.75), 4326)::geography)
    `;

    const owned = randomUUIDv7();
    const staffed = randomUUIDv7();
    for (const [merchantId, role] of [
      [owned, "owner"],
      [staffed, "staff"],
    ] as const) {
      await sql`
        INSERT INTO merchants
          (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at)
        VALUES (${merchantId}, ${"restaurant-" + merchantId}, 'Restaurant fictif', 'Propriétaire fictif',
          '+213500000040', ${communeId}, ST_SetSRID(ST_MakePoint(3, 36.75), 4326)::geography,
          ARRAY['algerian'], 'approved', ${now})
      `;
      await sql`INSERT INTO merchant_members (merchant_id, user_id, role)
        VALUES (${merchantId}, ${userId}, ${role})`;
    }
    return { owned, staffed };
  }

  return { database, openApi, seedActor, seedMenuMerchants };
}
