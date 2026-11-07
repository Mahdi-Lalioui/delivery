import { createHmac, randomBytes, randomUUIDv7 } from "node:crypto";
import { openDatabase } from "@zaafran/db/database";
import { migrateDatabase } from "@zaafran/db/migrate";
import { createTestClone } from "../../../packages/db/test/clone.ts";
import { sealTotpSecret } from "../src/auth-totp.ts";
import type { startApi } from "../src/start.ts";
import { startAuthProxy } from "./e2e-auth-proxy.ts";
import type { AuthHarness } from "./e2e-auth-types.ts";

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
