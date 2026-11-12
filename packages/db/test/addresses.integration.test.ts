import { randomUUID } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { createAddressRepository } from "../src/addresses.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const repo = () => createAddressRepository(database.get());
const userId = randomUUID();
const otherUserId = randomUUID();
const pin = { latitude: 36.75, longitude: 3.0625 };

beforeAll(async () => {
  const { sql } = database.get();
  await sql`INSERT INTO users (id, phone_e164, created_at) VALUES
    (${userId}, '+213500000001', now()), (${otherUserId}, '+213500000002', now())`;
  await sql`INSERT INTO service_areas (slug, city, active, polygon) VALUES (
    'fixture-alger', 'Alger', true,
    ST_GeogFromText('SRID=4326;MULTIPOLYGON(((3 36,4 36,4 37,3 37,3 36)))')
  )`;
});

test("[CUS-11] saves only serviceable pins, assigning a plus code and one default", async () => {
  expect(
    await repo().create(userId, { label: "Hors zone", pin: { latitude: 35, longitude: 3 } }),
  ).toEqual({ kind: "outside_service_area" });
  const address = await repo().create(userId, {
    label: "Maison",
    pin,
    landmark: "Près de la poste",
  });
  expect(address).toMatchObject({
    kind: "saved",
    address: { label: "Maison", pin, isDefault: true, plusCode: "8F85Q327+22" },
  });
  const work = await repo().create(userId, { label: "Bureau", pin, isDefault: true });
  expect(work).toMatchObject({ kind: "saved", address: { label: "Bureau", isDefault: true } });
  expect(await repo().list(userId)).toMatchObject([
    { label: "Bureau", isDefault: true },
    { label: "Maison", isDefault: false },
  ]);
});

test("[CUS-11] scopes edits and deletes and promotes another address when the default is removed", async () => {
  const first = await repo().create(otherUserId, { label: "Adresse privée", pin });
  const second = await repo().create(otherUserId, { label: "Deuxième", pin });
  if (first.kind !== "saved" || second.kind !== "saved")
    throw new Error("Expected saved addresses");
  const { addressId } = first.address;
  expect(await repo().update(userId, addressId, { label: "Modifiée", pin })).toEqual({
    kind: "missing",
  });
  expect(await repo().remove(userId, addressId)).toBe(false);
  expect(
    await repo().update(otherUserId, addressId, {
      label: "Modifiée",
      pin: { ...pin, latitude: 36.5 },
      floor: "2",
    }),
  ).toMatchObject({ kind: "saved", address: { label: "Modifiée", floor: "2", isDefault: true } });
  expect(await repo().remove(otherUserId, addressId)).toBe(true);
  expect(await repo().list(otherUserId)).toMatchObject([
    { addressId: second.address.addressId, isDefault: true },
  ]);
});

test("[CUS-11] serializes concurrent writes to keep exactly one default", async () => {
  const results = await Promise.all([
    repo().create(userId, { label: "Nord", pin, isDefault: true }),
    repo().create(userId, { label: "Sud", pin, isDefault: true }),
  ]);
  expect(results.map(({ kind }) => kind)).toEqual(["saved", "saved"]);
  expect((await repo().list(userId)).filter(({ isDefault }) => isDefault)).toHaveLength(1);
});
