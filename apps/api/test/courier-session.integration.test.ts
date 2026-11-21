import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { courierJobsOutput } from "@zaafran/contracts/courier";
import { createAuthRepository } from "@zaafran/db/auth";
import { createCourierRepository } from "@zaafran/db/couriers";
import { createMediaRepository } from "@zaafran/db/media";
import { createLocalMediaStore } from "@zaafran/media";
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

async function standardSession() {
  const repository = createAuthRepository(database.get());
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  if (!tokenHash) throw new Error("Expected valid session token");
  const phoneE164 = "+2135" + String(randomInt(10_000_000, 99_999_999));
  const user = await repository.transaction((tx) =>
    tx.getOrCreateUserForSignIn({ phoneE164, now }),
  );
  const sessionId = randomUUID();
  await repository.transaction((tx) =>
    tx.insertSession({
      id: sessionId,
      userId: user.id,
      tokenHash,
      transport: "web",
      kind: "standard",
      requestIp: "192.0.2.55",
      deviceName: "Isolation fixture",
      now,
    }),
  );
  return {
    userId: user.id,
    sessionId,
    headers: {
      cookie: "__Host-session=" + token,
      origin: publicOrigin,
      "sec-fetch-site": "same-origin",
    },
  };
}

async function seedMerchant(communeId: string) {
  const id = randomUUID();
  await database.get().sql`
    INSERT INTO public.merchants (
      id, slug, restaurant_name, owner_name, phone_e164, commune_id, location,
      cuisines, status, created_at
    ) VALUES (
      ${id}, ${"isolation-" + randomUUID()}, 'Synthetic restaurant', 'Synthetic owner',
      '+213500000021', ${communeId}, ST_GeogFromText('SRID=4326;POINT(3.06 36.75)'),
      ARRAY['algerian'], 'active', ${now.toISOString()}
    )
  `;
  return id;
}

async function seedCourier(userId: string, merchantId: string) {
  const id = randomUUID();
  await database.get().sql`
    INSERT INTO public.couriers (id, user_id, merchant_id, display_name, active, created_at)
    VALUES (${id}, ${userId}, ${merchantId}, 'Synthetic courier', true, ${now.toISOString()})
  `;
  return id;
}

async function seedDeliveryOrder({
  customerId,
  merchantId,
  courierId,
  shortCode,
  status,
  version,
}: {
  customerId: string;
  merchantId: string;
  courierId: string;
  shortCode: string;
  status: "ready" | "out_for_delivery";
  version: number;
}) {
  const id = randomUUID();
  await database.get().sql`
    INSERT INTO public.orders (
      id, quote_id, customer_id, merchant_id, restaurant_name, short_code, order_day,
      status, fulfilment, version, placed_at, last_event_at, courier_id, address_snapshot,
      subtotal_dzd, delivery_fee_dzd, total_dzd, paying_with_dzd, lines
    ) VALUES (
      ${id}, ${randomUUID()}, ${customerId}, ${merchantId}, 'Synthetic restaurant', ${shortCode},
      current_date, ${status}, 'delivery', ${version},
      ${new Date(now.getTime() - 60_000).toISOString()},
      ${new Date(now.getTime() - 5_000).toISOString()}, ${courierId},
      '{"pin":{"latitude":36.75,"longitude":3.06},"communeId":null,"plusCode":"8F62+22","landmark":"Synthetic landmark"}'::jsonb,
      1000, 100, 1100, 1200, '[]'::jsonb
    )
  `;
  return id;
}

test("[SECURITY] valid courier sessions see and change only assigned deliveries", async () => {
  await runMigrations({ connectionString: database.url(), schema: "graphile_worker" });
  const [firstCourierSession, otherCourierSession, unassignedSession, customer] = await Promise.all(
    [standardSession(), standardSession(), standardSession(), standardSession()],
  );
  const { sql } = database.get();
  await sql`INSERT INTO public.wilayas (code, name_ar, name_fr)
    VALUES (16, 'الجزائر', 'Alger') ON CONFLICT (code) DO NOTHING`;
  const code = String(randomInt(1000, 9999));
  const [commune] = await sql<{ id: string }[]>`
    INSERT INTO public.communes (code, wilaya_code, name_ar, name_fr, centroid)
    VALUES (${code}, 16, 'تجريبي', 'Test', ST_GeogFromText('SRID=4326;POINT(3.06 36.75)'))
    RETURNING id
  `;
  if (!commune) throw new Error("Expected synthetic commune");
  const [firstMerchantId, otherMerchantId] = await Promise.all([
    seedMerchant(commune.id),
    seedMerchant(commune.id),
  ]);
  const [firstCourierId, otherCourierId, unassignedCourierId] = await Promise.all([
    seedCourier(firstCourierSession.userId, firstMerchantId),
    seedCourier(otherCourierSession.userId, otherMerchantId),
    seedCourier(unassignedSession.userId, firstMerchantId),
  ]);
  const [firstOrderId, otherOrderId, readyOrderId] = await Promise.all([
    seedDeliveryOrder({
      customerId: customer.userId,
      merchantId: firstMerchantId,
      courierId: firstCourierId,
      shortCode: "AAA-222",
      status: "out_for_delivery",
      version: 5,
    }),
    seedDeliveryOrder({
      customerId: customer.userId,
      merchantId: otherMerchantId,
      courierId: otherCourierId,
      shortCode: "BBB-333",
      status: "out_for_delivery",
      version: 5,
    }),
    seedDeliveryOrder({
      customerId: customer.userId,
      merchantId: firstMerchantId,
      courierId: firstCourierId,
      shortCode: "CCC-444",
      status: "ready",
      version: 4,
    }),
  ]);
  const auth = createAuthService({
    repository: createAuthRepository(database.get()),
    otpKey: randomBytes(32),
    totpKey: randomBytes(32),
    now: () => now,
    sendSms: () => undefined,
  });
  const orders = createOrderRepository(database.get());
  const mediaRoot = await mkdtemp(join(tmpdir(), "awid-courier-proof-"));
  onTestFinished(() => rm(mediaRoot, { recursive: true, force: true }));
  const api = createApi({
    media: {
      repository: createMediaRepository(database.get()),
      store: createLocalMediaStore({ root: mediaRoot }),
      now: () => now,
    },
    checkReadiness: () => Promise.resolve(),
    auth: { service: auth, publicOrigin },
    couriers: { repository: createCourierRepository(database.get()), now: () => now },
    orderActions: { repository: orders, now: () => now },
  });
  onTestFinished(() => api.close());

  const jobs = async (headers: typeof firstCourierSession.headers) =>
    api.inject({ url: "/v1/courier/jobs", headers });
  const firstJobs = await jobs(firstCourierSession.headers);
  expect(firstJobs.statusCode).toBe(200);
  expect(courierJobsOutput.parse(firstJobs.json()).jobs.map((job) => job.order.orderId)).toEqual(
    [firstOrderId, readyOrderId].sort(),
  );
  const otherJobs = await jobs(otherCourierSession.headers);
  expect(otherJobs.statusCode).toBe(200);
  expect(courierJobsOutput.parse(otherJobs.json()).jobs.map((job) => job.order.orderId)).toEqual([
    otherOrderId,
  ]);
  expect(courierJobsOutput.parse((await jobs(unassignedSession.headers)).json()).jobs).toEqual([]);

  const reserveProof = (actor: typeof firstCourierSession, orderId: string) =>
    api.inject({
      method: "POST",
      url: "/v1/media/uploads",
      headers: {
        ...actor.headers,
        "x-expected-session-id": actor.sessionId,
        "idempotency-key": randomUUID(),
      },
      payload: { kind: "delivery_proof", orderId, contentType: "image/jpeg", bytes: 1024 },
    });
  expect((await reserveProof(otherCourierSession, firstOrderId)).statusCode).toBe(404);
  expect((await reserveProof(unassignedSession, firstOrderId)).statusCode).toBe(404);
  expect((await reserveProof(customer, firstOrderId)).statusCode).toBe(404);
  expect(
    await sql`SELECT FROM public.media_uploads WHERE delivery_order_id = ${firstOrderId}`,
  ).toHaveLength(0);
  expect((await reserveProof(firstCourierSession, firstOrderId)).statusCode).toBe(201);

  const position = {
    latitude: 36.75,
    longitude: 3.06,
    accuracyM: 8,
    capturedAt: now.toISOString(),
  };
  const sendPosition = (headers: typeof firstCourierSession.headers, orderId: string) =>
    api.inject({
      method: "POST",
      url: "/v1/courier/positions",
      headers,
      payload: { orderId, positions: [position] },
    });
  expect((await sendPosition(otherCourierSession.headers, firstOrderId)).statusCode).toBe(404);
  expect((await sendPosition(unassignedSession.headers, firstOrderId)).statusCode).toBe(404);
  expect((await sendPosition(firstCourierSession.headers, otherOrderId)).statusCode).toBe(404);
  expect(
    await sql`SELECT FROM public.courier_positions WHERE order_id = ANY(${[firstOrderId, otherOrderId]}::uuid[])`,
  ).toHaveLength(0);
  expect((await sendPosition(firstCourierSession.headers, firstOrderId)).json()).toEqual({
    accepted: 1,
  });

  const sendAttempt = (headers: typeof firstCourierSession.headers, orderId: string) =>
    api.inject({
      method: "POST",
      url: `/v1/orders/${orderId}/delivery-attempts`,
      headers: { ...headers, "idempotency-key": "courier-isolation-wait" },
      payload: { action: "start_wait" },
    });
  expect((await sendAttempt(otherCourierSession.headers, firstOrderId)).statusCode).toBe(404);
  expect((await sendAttempt(unassignedSession.headers, firstOrderId)).statusCode).toBe(404);
  expect((await sendAttempt(firstCourierSession.headers, otherOrderId)).statusCode).toBe(404);
  expect(
    await sql`SELECT FROM public.courier_delivery_attempts WHERE order_id = ANY(${[firstOrderId, otherOrderId]}::uuid[])`,
  ).toHaveLength(0);
  expect((await sendAttempt(firstCourierSession.headers, firstOrderId)).json()).toEqual({
    waitStartedAt: now.toISOString(),
    callAttempts: 0,
  });

  const deliveryOrderIds = [firstOrderId, otherOrderId];
  const beforeCompletion = await sql`
    SELECT id, status, version, courier_id, delivery_code_attempts, delivery_code_digest
    FROM public.orders WHERE id = ANY(${deliveryOrderIds}::uuid[]) ORDER BY id
  `;
  for (const action of [
    { name: "deliver", payload: { expectedVersion: 5, proof: { kind: "code", code: "0123" } } },
    { name: "fail", payload: { expectedVersion: 5, reason: "Synthetic failed delivery" } },
  ]) {
    for (const [session, orderId] of [
      [otherCourierSession, firstOrderId],
      [unassignedSession, firstOrderId],
      [firstCourierSession, otherOrderId],
      [customer, firstOrderId],
      [customer, otherOrderId],
    ] as const) {
      const response = await api.inject({
        method: "POST",
        url: `/v1/orders/${orderId}/${action.name}`,
        headers: { ...session.headers, "idempotency-key": `courier-isolation-${action.name}` },
        payload: action.payload,
      });
      expect(response.statusCode, `${action.name} by ${session.userId} on ${orderId}`).toBe(404);
      expect(response.json()).toMatchObject({ code: "not_found" });
    }
  }
  expect(
    await sql`
      SELECT id, status, version, courier_id, delivery_code_attempts, delivery_code_digest
      FROM public.orders WHERE id = ANY(${deliveryOrderIds}::uuid[]) ORDER BY id
    `,
  ).toEqual(beforeCompletion);
  expect(
    await sql`SELECT FROM public.order_action_receipts WHERE order_id = ANY(${deliveryOrderIds}::uuid[])`,
  ).toHaveLength(0);
  expect(
    await sql`SELECT FROM public.order_events WHERE order_id = ANY(${deliveryOrderIds}::uuid[])`,
  ).toHaveLength(0);

  const pickUp = (headers: typeof firstCourierSession.headers) =>
    api.inject({
      method: "POST",
      url: `/v1/orders/${readyOrderId}/pick-up`,
      headers: { ...headers, "idempotency-key": "courier-isolation-pickup" },
      payload: { expectedVersion: 4 },
    });
  expect((await pickUp(otherCourierSession.headers)).statusCode).toBe(404);
  expect((await pickUp(unassignedSession.headers)).statusCode).toBe(404);
  expect(await sql`SELECT status, version FROM public.orders WHERE id = ${readyOrderId}`).toEqual([
    { status: "ready", version: 4 },
  ]);
  expect((await pickUp(firstCourierSession.headers)).json()).toMatchObject({
    orderId: readyOrderId,
    status: "out_for_delivery",
    version: 5,
  });

  expect(
    await sql`SELECT FROM public.courier_positions WHERE order_id = ${otherOrderId}`,
  ).toHaveLength(0);
  expect(
    await sql`SELECT FROM public.courier_delivery_attempts WHERE order_id = ${otherOrderId}`,
  ).toHaveLength(0);
  expect(await sql`SELECT status, version FROM public.orders WHERE id = ${otherOrderId}`).toEqual([
    { status: "out_for_delivery", version: 5 },
  ]);
  expect(
    await sql`SELECT id FROM public.couriers WHERE id = ${unassignedCourierId} AND active`,
  ).toHaveLength(1);
});
