import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { openDatabase } from "@zaafran/db/database";
import type { AuthCodeAdapters } from "./auth-service.js";
import { sealTotpSecret } from "./auth-totp.js";
import { readApiEnvironment } from "./environment.js";
import { publishLocalDemoPhotos } from "./local-demo-photos.js";

const accounts = [
  { phone: "+213500000001", id: "12e50205-d127-47b4-971f-55e0ec100001" },
  { phone: "+213500000002", id: "12e50205-d127-47b4-971f-55e0ec100002" },
  { phone: "+213500000003", id: "12e50205-d127-47b4-971f-55e0ec100003" },
] as const;
const [, , admin] = accounts;
const phones = new Set<string>(accounts.map(({ phone }) => phone));
const otp = "314159";
const adminCode = "271828";

async function seedAccounts(databaseUrl: string, totpKey: string, mediaRoot: string) {
  const fixture = await readFile(new URL("./local-demo-seed.sql", import.meta.url), "utf8");
  const assets = await publishLocalDemoPhotos(mediaRoot);
  const db = openDatabase(databaseUrl);
  const sealed = sealTotpSecret({
    key: Buffer.from(totpKey, "hex"),
    userId: admin.id,
    secret: randomBytes(20),
  });
  try {
    await db.sql.begin(async (sql) => {
      for (const { phone, id } of accounts) {
        await sql`
          INSERT INTO public.users (id, phone_e164, created_at)
          VALUES (${id}, ${phone}, now())
          ON CONFLICT (id) DO UPDATE
          SET phone_e164 = EXCLUDED.phone_e164, blocked_at = NULL, deleted_at = NULL
        `;
      }
      await sql`
        INSERT INTO public.admins (user_id, totp_secret_encrypted)
        VALUES (${admin.id}, ${sealed})
        ON CONFLICT (user_id) DO UPDATE
        SET totp_secret_encrypted = EXCLUDED.totp_secret_encrypted
      `;
      await sql`
        CREATE TEMP TABLE demo_photo_assets
        (cuisine text, kind text, thumbhash text, variants jsonb) ON COMMIT DROP
      `;
      await sql`
        INSERT INTO demo_photo_assets SELECT * FROM jsonb_to_recordset(${JSON.stringify(assets)}::jsonb)
        AS asset(cuisine text, kind text, thumbhash text, variants jsonb)
      `;
      await sql.unsafe(fixture).simple();
    });
  } finally {
    await db.close();
  }
}

export async function loadLocalDemoAuth(
  env: Readonly<Record<string, string | undefined>>,
): Promise<AuthCodeAdapters | undefined> {
  if (env.NODE_ENV !== "development" || env.ZAAFRAN_LOCAL_DEMO !== "1") return undefined;
  const api = readApiEnvironment(env);
  const database = new URL(api.DATABASE_URL);
  if (
    api.API_HOST !== "127.0.0.1" ||
    api.API_PORT !== 3102 ||
    api.API_TRUSTED_PROXY !== undefined ||
    api.AUTH_PUBLIC_ORIGIN !== "http://127.0.0.1:3100" ||
    database.host !== "127.0.0.1:55432" ||
    database.pathname !== "/zaafran_dev"
  ) {
    throw new Error("Local demo sign-in requires the isolated pnpm demo stack.");
  }

  await seedAccounts(api.DATABASE_URL, api.AUTH_TOTP_KEY, api.MEDIA_STORAGE_ROOT);
  let lastStep = 0;
  return {
    otp: (phone) => (phones.has(phone) ? otp : undefined),
    totp: ({ userId, code, now }) => {
      if (userId !== admin.id || code !== adminCode) return undefined;
      lastStep = Math.max(lastStep + 1, now.getTime());
      return lastStep;
    },
  };
}
