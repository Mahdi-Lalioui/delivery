import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import {
  createMerchantHoursRepository,
  type MerchantHours,
  type MerchantHoursReplace,
  type RamadanSchedule,
} from "../src/merchant-hours.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const now = new Date("2026-11-08T02:00:00.000Z");

function fixtureId(serial: number) {
  return `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
}

const communeId = fixtureId(1);
const ownerId = fixtureId(2);
const replacing = fixtureId(10);
const replaying = fixtureId(20);
const stale = fixtureId(30);
const staffed = fixtureId(40);
const foreign = fixtureId(50);
const fasting = fixtureId(60);
const pausing = fixtureId(70);
const previewing = fixtureId(80);

function emptyWeek(): MerchantHours["weekly"] {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, ranges: [] }));
}

const splitWeek: MerchantHours = {
  weekly: emptyWeek().map((day) =>
    day.weekday === 5
      ? { weekday: 5, ranges: [] }
      : {
          weekday: day.weekday,
          ranges: [
            { opensMinute: 690, closesMinute: 900 },
            { opensMinute: 1080, closesMinute: 120 },
          ],
        },
  ),
  specialDates: [
    { date: "2026-12-31", ranges: [{ opensMinute: 1080, closesMinute: 180 }] },
    { date: "2026-11-01", ranges: [] },
  ],
};

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

function replaceRequest(
  merchantId: string,
  { key = "key-1", hours = splitWeek, expectedRevision = 0 } = {},
): MerchantHoursReplace {
  return {
    accountId: ownerId,
    merchantId,
    input: { ...hours, expectedRevision },
    idempotencyKeyHash: hash(key),
    requestHash: hash(JSON.stringify(hours)),
    now,
  };
}

beforeAll(async () => {
  const { sql } = database.get();
  await sql`
    insert into wilayas (code, name_ar, name_fr)
    values (16, 'ولاية تجريبية', 'Wilaya de test') on conflict (code) do nothing
  `;
  await sql`
    insert into communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    values (${communeId}, '1699', 16, 'بلدية تجريبية', 'Commune de test',
      st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography)
  `;
  await sql`
    insert into users (id, phone_e164, created_at)
    values (${ownerId}, '+213500000010', ${now.toISOString()}::timestamptz)
  `;
  for (const merchantId of [
    replacing,
    replaying,
    stale,
    staffed,
    foreign,
    fasting,
    pausing,
    previewing,
  ]) {
    await sql`
      insert into merchants
        (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at)
      values (${merchantId}, ${`fixture-${merchantId}`}, 'Restaurant fictif de test', 'Propriétaire de test',
        '+213500000010', ${communeId}, st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography,
        array['algerian'], 'approved', ${now.toISOString()}::timestamptz)
    `;
  }
  for (const merchantId of [replacing, replaying, stale, fasting, pausing, previewing]) {
    await sql`insert into merchant_members (merchant_id, user_id, role) values (${merchantId}, ${ownerId}, 'owner')`;
  }
  await sql`insert into merchant_members (merchant_id, user_id, role) values (${staffed}, ${ownerId}, 'staff')`;
});

test("[MER-15:db] replaces weekly ranges and special dates and reads them back in order", async () => {
  const hours = createMerchantHoursRepository(database.get());
  const result = await hours.replace(replaceRequest(replacing));
  expect(result).toEqual({ kind: "applied", revision: 1 });
  expect(await hours.read({ accountId: ownerId, merchantId: replacing })).toEqual({
    revision: 1,
    weekly: splitWeek.weekly,
    specialDates: [...splitWeek.specialDates].sort((a, b) => a.date.localeCompare(b.date)),
  });

  const shorter: MerchantHours = {
    weekly: emptyWeek().map((day) =>
      day.weekday === 0 ? { weekday: 0, ranges: [{ opensMinute: 0, closesMinute: 1440 }] } : day,
    ),
    specialDates: [],
  };
  const second = await hours.replace(
    replaceRequest(replacing, { key: "key-2", hours: shorter, expectedRevision: 1 }),
  );
  expect(second).toEqual({ kind: "applied", revision: 2 });
  expect(await hours.read({ accountId: ownerId, merchantId: replacing })).toEqual({
    revision: 2,
    ...shorter,
  });
});

test("[MER-15:db] replays the same key once and rejects it for a different request", async () => {
  const hours = createMerchantHoursRepository(database.get());
  expect(await hours.replace(replaceRequest(replaying))).toEqual({ kind: "applied", revision: 1 });
  expect(await hours.replace(replaceRequest(replaying))).toEqual({
    kind: "replayed",
    revision: 1,
  });
  const other = { ...splitWeek, specialDates: [] };
  expect(await hours.replace(replaceRequest(replaying, { hours: other }))).toEqual({
    kind: "idempotency_conflict",
  });
  const { sql } = database.get();
  const [count] = await sql<{ total: number }[]>`
    select count(*)::int as total from merchant_special_dates where merchant_id = ${replaying}
  `;
  expect(count?.total).toBe(2);
});

test("[MER-15:db] keeps the stored hours after a stale revision", async () => {
  const hours = createMerchantHoursRepository(database.get());
  expect(await hours.replace(replaceRequest(stale, { expectedRevision: 3 }))).toEqual({
    kind: "revision_conflict",
  });
  expect(await hours.read({ accountId: ownerId, merchantId: stale })).toEqual({
    revision: 0,
    weekly: emptyWeek(),
    specialDates: [],
  });
});

test("[MER-15:authz] denies staff and non-members in the SQL membership check", async () => {
  const hours = createMerchantHoursRepository(database.get());
  for (const merchantId of [staffed, foreign]) {
    expect(await hours.replace(replaceRequest(merchantId))).toEqual({ kind: "not_found" });
    expect(await hours.read({ accountId: ownerId, merchantId })).toBeUndefined();
  }
  const { sql } = database.get();
  const rows = await sql`
    select merchant_id from merchant_hours where merchant_id in (${staffed}, ${foreign})
  `;
  expect(rows).toHaveLength(0);
});

const ramadan: RamadanSchedule = {
  weekly: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    ranges: [
      { opens: { kind: "maghrib", minutes: -60 }, closes: { kind: "clock", minuteOfDay: 120 } },
    ],
  })),
  suhoor: { opensMinute: 0, closesMinute: 240 },
  method: "Algeria",
  adjustmentMinutes: 2,
};

function ramadanRequest(
  merchantId: string,
  { key = "ramadan-1", schedule = ramadan, expectedRevision = 0 } = {},
) {
  return {
    accountId: ownerId,
    merchantId,
    input: { ...schedule, expectedRevision },
    idempotencyKeyHash: hash(key),
    requestHash: hash(JSON.stringify(schedule)),
    now,
  };
}

test("[MER-16:db] stores the Ramadan schedule with the hours guard and replaces it whole", async () => {
  const hours = createMerchantHoursRepository(database.get());
  const scope = { accountId: ownerId, merchantId: fasting };
  expect(await hours.readRamadan(scope)).toEqual({ revision: 0, schedule: null });
  expect(await hours.replaceRamadan(ramadanRequest(fasting))).toEqual({
    kind: "applied",
    revision: 1,
  });
  expect(await hours.replaceRamadan(ramadanRequest(fasting))).toEqual({
    kind: "replayed",
    revision: 1,
  });
  expect(await hours.readRamadan(scope)).toEqual({ revision: 1, schedule: ramadan });

  const plain = { ...ramadan, suhoor: null, method: "UmmAlQura" as const, adjustmentMinutes: 0 };
  expect(
    await hours.replaceRamadan(
      ramadanRequest(fasting, { key: "ramadan-2", schedule: plain, expectedRevision: 1 }),
    ),
  ).toEqual({ kind: "applied", revision: 2 });
  expect(await hours.readRamadan(scope)).toEqual({ revision: 2, schedule: plain });
  expect(
    await hours.replaceRamadan(ramadanRequest(fasting, { key: "ramadan-3", expectedRevision: 1 })),
  ).toEqual({ kind: "revision_conflict" });
});

test("[MER-16:authz] denies the Ramadan schedule to staff and non-members", async () => {
  const hours = createMerchantHoursRepository(database.get());
  for (const merchantId of [staffed, foreign]) {
    expect(await hours.replaceRamadan(ramadanRequest(merchantId))).toEqual({ kind: "not_found" });
    expect(await hours.readRamadan({ accountId: ownerId, merchantId })).toBeUndefined();
  }
});

function pauseRequest(
  merchantId: string,
  {
    key = "pause-1",
    pausedUntil = "2026-11-08T05:00:00.000Z",
    revision = 0,
  }: { key?: string; pausedUntil?: string | null; revision?: number } = {},
) {
  return {
    accountId: ownerId,
    merchantId,
    input: { pausedUntil, expectedRevision: revision },
    idempotencyKeyHash: hash(key),
    requestHash: hash(String(pausedUntil)),
    now,
  };
}

test("[MER-15:db] closes the restaurant until a future instant and reopens it", async () => {
  const hours = createMerchantHoursRepository(database.get());
  const scope = { accountId: ownerId, merchantId: pausing };
  expect(await hours.readPause(scope)).toEqual({ revision: 0, pausedUntil: null });
  expect(await hours.pause(pauseRequest(pausing))).toEqual({ kind: "applied", revision: 1 });
  expect(await hours.readPause(scope)).toEqual({
    revision: 1,
    pausedUntil: "2026-11-08T05:00:00.000Z",
  });
  expect(
    await hours.pause(
      pauseRequest(pausing, { key: "pause-2", pausedUntil: now.toISOString(), revision: 1 }),
    ),
  ).toEqual({ kind: "pause_not_in_future" });
  expect(
    await hours.pause(pauseRequest(pausing, { key: "pause-3", pausedUntil: null, revision: 1 })),
  ).toEqual({ kind: "applied", revision: 2 });
  expect(await hours.readPause(scope)).toEqual({ revision: 2, pausedUntil: null });
});

test("[MER-15:authz] denies the closed-now override to staff and non-members", async () => {
  const hours = createMerchantHoursRepository(database.get());
  for (const merchantId of [staffed, foreign]) {
    expect(await hours.pause(pauseRequest(merchantId))).toEqual({ kind: "not_found" });
    expect(await hours.readPause({ accountId: ownerId, merchantId })).toBeUndefined();
  }
});

test("[MER-16:db] reads hours, Ramadan, pause and location for the preview in one snapshot", async () => {
  const hours = createMerchantHoursRepository(database.get());
  const scope = { accountId: ownerId, merchantId: previewing };
  expect(await hours.readSchedule(scope)).toEqual({
    hours: { weekly: emptyWeek(), specialDates: [] },
    ramadan: null,
    pausedUntil: null,
    coordinates: { latitude: 36.765, longitude: 3.05 },
  });
  await hours.replace(replaceRequest(previewing));
  await hours.replaceRamadan(ramadanRequest(previewing, { expectedRevision: 1 }));
  await hours.pause(pauseRequest(previewing, { revision: 2 }));
  expect(await hours.readSchedule(scope)).toEqual({
    hours: {
      weekly: splitWeek.weekly,
      specialDates: [...splitWeek.specialDates].sort((a, b) => a.date.localeCompare(b.date)),
    },
    ramadan,
    pausedUntil: "2026-11-08T05:00:00.000Z",
    coordinates: { latitude: 36.765, longitude: 3.05 },
  });
  for (const merchantId of [staffed, foreign]) {
    expect(await hours.readSchedule({ accountId: ownerId, merchantId })).toBeUndefined();
  }
});
