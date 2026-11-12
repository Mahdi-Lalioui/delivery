import { randomBytes, randomUUID } from "node:crypto";
import { createAuthRepository } from "@zaafran/db/auth";
import { createOrderRepository } from "@zaafran/db/orders";
import { runMigrations } from "graphile-worker";
import { expect, onTestFinished, test } from "vitest";
import { registerTestDatabase } from "../../../packages/db/test/database.ts";
import { createApi } from "../src/app.ts";
import { hashSessionToken } from "../src/auth-crypto.ts";
import { createAuthService } from "../src/auth-service.ts";

const database = registerTestDatabase();
const publicOrigin = "https://awid.test";
const now = new Date();

async function standardSession(phoneE164: string) {
  const repository = createAuthRepository(database.get());
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  if (!tokenHash) throw new Error("Expected a valid token");
  const user = await repository.transaction((tx) =>
    tx.getOrCreateUserForSignIn({ phoneE164, now }),
  );
  await repository.transaction((tx) =>
    tx.insertSession({
      id: randomUUID(),
      userId: user.id,
      tokenHash,
      transport: "web",
      kind: "standard",
      requestIp: "192.0.2.15",
      deviceName: "Fixture",
      now,
    }),
  );
  const headers = {
    cookie: "__Host-session=" + token,
    origin: publicOrigin,
    "sec-fetch-site": "same-origin",
  };
  return { userId: user.id, headers };
}

async function seedOrder(customerId: string, merchantUserId: string) {
  const { sql } = database.get();
  const merchantId = randomUUID();
  const orderId = randomUUID();
  await sql`INSERT INTO wilayas (code, name_ar, name_fr) VALUES (16, 'الجزائر', 'Alger')`;
  await sql`
    WITH commune AS (
      INSERT INTO communes (code, wilaya_code, name_ar, name_fr, centroid)
      VALUES ('1699', 16, 'تجريبي', 'Test', ST_GeogFromText('SRID=4326;POINT(3 36)')) RETURNING id
    )
    INSERT INTO merchants (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at)
    SELECT ${merchantId}, 'fixture-board', 'Test', 'Synthetic owner', '+213500000000', id,
      ST_GeogFromText('SRID=4326;POINT(3 36)'), ARRAY['algerian'], 'active', now()
    FROM commune
  `;
  await sql`INSERT INTO merchant_members (merchant_id, user_id, role) VALUES (${merchantId}, ${merchantUserId}, 'owner')`;
  await sql`
    INSERT INTO orders (
      id, quote_id, customer_id, merchant_id, restaurant_name, short_code, order_day, status, fulfilment,
      version, placed_at, last_event_at, acceptance_deadline_at, subtotal_dzd, delivery_fee_dzd,
      total_dzd, paying_with_dzd, lines
    )
    VALUES (${orderId}, ${randomUUID()}, ${customerId}, ${merchantId}, 'Test', 'AAA-222', current_date,
      'pending_acceptance', 'pickup', 1, ${now.toISOString()}, ${now.toISOString()},
      ${new Date(now.getTime() + 60_000).toISOString()}, 1000, 0, 1000, 1000, '[]')
  `;
  return { merchantId, orderId };
}

test("[AUTH-06][MER-03] real standard session cookies reach the board only for merchant members", async () => {
  await runMigrations({ connectionString: database.url(), schema: "graphile_worker" });
  const [owner, customer, outsider] = await Promise.all([
    standardSession("+213500000001"),
    standardSession("+213500000002"),
    standardSession("+213500000003"),
  ]);
  const { merchantId, orderId } = await seedOrder(customer.userId, owner.userId);
  const repository = createOrderRepository(database.get());
  const auth = createAuthService({
    repository: createAuthRepository(database.get()),
    otpKey: randomBytes(32),
    totpKey: randomBytes(32),
    now: () => now,
    sendSms: () => undefined,
  });
  let replayed = false;
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    auth: { service: auth, publicOrigin },
    merchantBoard: repository,
    orderActions: { repository, now: () => now },
    realtime: {
      async replay(scope) {
        if (replayed) return undefined;
        replayed = true;
        return repository.merchantReplay(scope);
      },
      replayOrder: repository.orderReplay,
      subscribe(_merchantId, wake) {
        wake();
        return () => undefined;
      },
      subscribeOrder: () => () => undefined,
    },
  });
  onTestFinished(() => api.close());
  const board = `/v1/merchants/${merchantId}/order-board`;
  expect((await api.inject({ url: board, headers: owner.headers })).statusCode).toBe(200);
  expect((await api.inject({ url: board, headers: customer.headers })).statusCode).toBe(404);
  const url = `/v1/orders/${orderId}`;
  expect((await api.inject({ url, headers: outsider.headers })).statusCode).toBe(404);
  expect((await api.inject({ url, headers: owner.headers })).statusCode).toBe(200);
  expect((await api.inject({ url, headers: customer.headers })).statusCode).toBe(200);
  const accept = (headers: typeof owner.headers) =>
    api.inject({
      url: url + "/accept",
      method: "POST",
      headers: { ...headers, "idempotency-key": "fixture-accept" },
      payload: { expectedVersion: 1, prepMinutes: 15 },
    });
  expect((await accept(customer.headers)).statusCode).toBe(404);
  const accepted = await accept(owner.headers);
  expect(accepted.statusCode).toBe(200);
  expect(accepted.json()).toMatchObject({ status: "accepted", version: 2 });
  const cancel = (headers: typeof owner.headers) =>
    api.inject({
      url: url + "/cancel",
      method: "POST",
      headers: { ...headers, "idempotency-key": "fixture-cancel" },
      payload: { expectedVersion: 2, reason: "Fixture cancellation" },
    });
  expect((await cancel(customer.headers)).statusCode).toBe(409);
  expect((await cancel(owner.headers)).json()).toMatchObject({ status: "cancelled", version: 3 });
  const stream = await api.inject({
    url: "/v1/realtime?topic=merchantOrders&merchantId=" + merchantId + "&after=0",
    headers: owner.headers,
  });
  expect(stream.statusCode).toBe(200);
  expect(stream.body).toContain('"status":"accepted"');
});
