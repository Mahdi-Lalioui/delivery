import { createHash, randomUUID } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { createAddressRepository } from "../src/addresses.ts";
import {
  createMerchantDeliveryRepository,
  type DeliveryReplace,
} from "../src/merchant-delivery.ts";
import { readDeliveryZone } from "../src/order-quote-availability.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const merchantId = randomUUID();
const ownerId = randomUUID();
const managerId = randomUUID();
const staffId = randomUUID();
const outsiderId = randomUUID();
const now = new Date("2026-11-11T12:00:00.000Z");
const zone = { radiusMeters: 700, feeDzd: 180, minimumDzd: 500, travelMinutes: 12 };
const settings = {
  pickupEnabled: true,
  deliveryEnabled: true,
  pickupMinimumDzd: 300,
  prepMinutes: 25,
  zone,
};

function hash(input: string) {
  return createHash("sha256").update(input).digest();
}

function request(input: DeliveryReplace["input"], key = "delivery-settings"): DeliveryReplace {
  return {
    merchantId,
    accountId: ownerId,
    input,
    now,
    idempotencyKeyHash: hash(key),
    requestHash: hash(JSON.stringify(input)),
  };
}

beforeAll(async () => {
  const { sql } = database.get();
  await sql`INSERT INTO wilayas (code, name_ar, name_fr) VALUES (16, 'الجزائر', 'Alger')`;
  const communeId = randomUUID();
  const origin = "SRID=4326;POINT(3.0625 36.75)";
  await sql`
    INSERT INTO communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    VALUES (${communeId}, '1699', 16, 'الجزائر', 'Alger', ST_GeogFromText(${origin}))
  `;
  await sql`
    INSERT INTO users (id, phone_e164, created_at) VALUES
    (${ownerId}, '+213500000001', now()), (${managerId}, '+213500000002', now()),
    (${staffId}, '+213500000003', now()), (${outsiderId}, '+213500000004', now())
  `;
  await sql`
    INSERT INTO merchants (id, slug, restaurant_name, owner_name, phone_e164, commune_id,
      location, cuisines, status, created_at)
    VALUES (${merchantId}, 'radius-fixture', 'Table fictive', 'Équipe de test', '+213500000001',
      ${communeId}, ST_GeogFromText(${origin}), ARRAY['algerian'], 'active', now())
  `;
  await sql`
    INSERT INTO merchant_members (merchant_id, user_id, role) VALUES
    (${merchantId}, ${ownerId}, 'owner'), (${merchantId}, ${managerId}, 'manager'),
    (${merchantId}, ${staffId}, 'staff')
  `;
  await sql`
    INSERT INTO service_areas (slug, city, active, polygon) VALUES ('radius-fixture', 'Alger', true,
      ST_GeogFromText('SRID=4326;MULTIPOLYGON(((3 36,4 36,4 37,3 37,3 36)))'))
  `;
});

async function zoneAt(latitude: number) {
  const databaseConnection = database.get();
  const address = await createAddressRepository(databaseConnection).create(outsiderId, {
    label: "Adresse de test",
    pin: { latitude, longitude: 3.0625 },
  });
  if (address.kind !== "saved") throw new Error("Could not save the test address");
  return databaseConnection.sql.begin((tx) =>
    readDeliveryZone(tx, {
      merchantId,
      customerId: outsiderId,
      addressId: address.address.addressId,
    }),
  );
}

test("[MER-17] atomically configures an exact radius with replay and tenant authorization", async () => {
  const repository = createMerchantDeliveryRepository(database.get());
  const original = request({ ...settings, expectedRevision: 0 });

  expect(await repository.read({ merchantId, accountId: managerId })).toMatchObject({
    revision: 0,
    settings: { pickupEnabled: false, deliveryEnabled: false, zone: null },
  });
  for (const accountId of [staffId, outsiderId]) {
    expect(await repository.read({ merchantId, accountId })).toBeUndefined();
    expect(await repository.replace({ ...original, accountId })).toEqual({ kind: "not_found" });
  }

  const simultaneous = await Promise.all([
    repository.replace(original),
    repository.replace(original),
  ]);
  expect(simultaneous.map(({ kind }) => kind).sort()).toEqual(["applied", "replayed"]);
  expect(await repository.read({ merchantId, accountId: ownerId })).toEqual({
    settings,
    revision: 1,
  });

  const changed = { ...original.input, zone: { ...zone, feeDzd: 300 } };
  expect(await repository.replace(request(changed))).toEqual({ kind: "idempotency_conflict" });
  expect(await repository.replace(request(changed, "another-key"))).toEqual({
    kind: "revision_conflict",
  });
  expect(await zoneAt(36.751)).toMatchObject({
    zone: { feeDzd: 180, minimumDzd: 500, travelMinutes: 12 },
  });
  expect(await zoneAt(36.76)).toMatchObject({ zone: null });

  const disabled = { ...settings, deliveryEnabled: false, expectedRevision: 1 };
  expect(
    await repository.replace({ ...request(disabled, "disable"), accountId: managerId }),
  ).toEqual({ kind: "applied", revision: 2 });
  expect(await zoneAt(36.751)).toMatchObject({ zone: null });
  expect(await repository.read({ merchantId, accountId: ownerId })).toMatchObject({
    settings: { deliveryEnabled: false, zone },
  });
});
