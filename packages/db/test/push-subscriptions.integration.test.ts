import { randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { createAuthRepository } from "../src/auth.ts";
import { createPushSubscriptionRepository } from "../src/push-subscriptions.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const keys = { p256dh: "B" + "A".repeat(86), auth: "A".repeat(22) };
const endpoint = "https://fcm.googleapis.com/fcm/send/fixture";
let phoneSuffix = 50;

async function customer() {
  const now = new Date();
  const auth = createAuthRepository(database.get());
  const phoneE164 = "+2135000000" + String(++phoneSuffix);
  const { id: userId } = await auth.transaction((tx) =>
    tx.getOrCreateUserForSignIn({ phoneE164, now }),
  );
  const sessionId = randomUUID();
  await auth.transaction((tx) =>
    tx.insertSession({
      id: sessionId,
      userId,
      tokenHash: randomBytes(32),
      transport: "web",
      kind: "standard",
      requestIp: "192.0.2.4",
      deviceName: "Fixture",
      now,
    }),
  );
  return { userId, sessionId };
}

test("[NOT-04] registration is idempotent and cannot steal a live account's subscription", async () => {
  const repository = createPushSubscriptionRepository(database.get());
  const [first, second] = await Promise.all([customer(), customer()]);
  expect(await repository.save(first, { endpoint, keys })).toBe("saved");
  expect(await repository.save(first, { endpoint, keys })).toBe("saved");
  expect(await repository.save(second, { endpoint, keys })).toBe("subscription_in_use");
  await repository.remove(second, endpoint);
  const { sql } = database.get();
  expect(await sql`SELECT user_id FROM push_subscriptions WHERE endpoint = ${endpoint}`).toEqual([
    { user_id: first.userId },
  ]);
  await sql`UPDATE sessions SET revoked_at = now() WHERE id = ${first.sessionId}`;
  expect(await repository.save(first, { endpoint, keys })).toBe("unauthorized");
  expect(await repository.save(second, { endpoint, keys })).toBe("saved");
  await repository.remove(second, endpoint);
  expect(await sql`SELECT FROM push_subscriptions WHERE endpoint = ${endpoint}`).toHaveLength(0);
});

test("[NOT-04] concurrent subscriptions respect the active account cap", async () => {
  const repository = createPushSubscriptionRepository(database.get());
  const account = await customer();
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      repository.save(account, { endpoint: endpoint + "/" + String(index), keys }),
    ),
  );
  expect(results.filter((result) => result === "saved")).toHaveLength(10);
  expect(results.filter((result) => result === "subscription_limit")).toHaveLength(2);
});
