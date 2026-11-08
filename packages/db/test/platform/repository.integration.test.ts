import { createHash } from "node:crypto";
import { beforeAll, expect, test, vi } from "vitest";
import { openDatabase } from "../../src/database.ts";
import { createPlatformRepository } from "../../src/platform/repository.ts";
import { registerTestDatabase } from "../database.ts";

const database = registerTestDatabase();
const now = new Date("2026-11-08T14:00:00.123Z");
const adminUserId = "01932f18-3150-7c33-8a7a-000000000001";
const regularUserId = "01932f18-3150-7c33-8a7a-000000000002";
const blockedAdminId = "01932f18-3150-7c33-8a7a-000000000003";
const cityId = "01932f18-3150-7c33-8a7a-000000000004";
const invalidCityId = "01932f18-3150-7c33-8a7a-000000000005";
const reason = "Configuration de test";
const banner = { ar: "صيانة", fr: "Maintenance", en: "Maintenance" };

function command<Input extends object>(key: string, input: Input, token: string) {
  return {
    adminUserId,
    now,
    key,
    input,
    idempotencyKeyHash: createHash("sha256").update(token).digest(),
    requestHash: createHash("sha256").update(JSON.stringify({ key, input })).digest(),
  };
}

beforeAll(async () => {
  const { sql } = database.get();
  await sql`
    INSERT INTO users (id, phone_e164, created_at, blocked_at)
    VALUES (${adminUserId}, '+213500000011', ${now.toISOString()}, NULL),
      (${regularUserId}, '+213500000012', ${now.toISOString()}, NULL),
      (${blockedAdminId}, '+213500000013', ${now.toISOString()}, ${now.toISOString()})
  `;
  await sql`
    INSERT INTO admins (user_id, totp_secret_encrypted)
    VALUES (${adminUserId}, decode('01', 'hex')), (${blockedAdminId}, decode('01', 'hex'))
  `;
});

test("[ADM-08:db] projects persisted platform defaults and the billing singleton", async () => {
  const repository = createPlatformRepository(database.get());
  expect(await repository.readAdminSettings(adminUserId)).toEqual({
    settings: {
      order_accept_timeout_seconds: 480,
      first_order_cash_cap_dzd: 6000,
      subscription_price_dzd: 5000,
      subscription_trial_days: 30,
      maintenance_banner: null,
    },
  });
  const { sql } = database.get();
  await sql`UPDATE billing_settings SET price_dzd = 7250, trial_days = 15 WHERE singleton`;
  expect(await repository.readAdminSettings(adminUserId)).toMatchObject({
    settings: { subscription_price_dzd: 7250, subscription_trial_days: 15 },
  });
});

test("[ADM-08:authz] denies settings, flag and audit commands for blocked admins and non-admins", async () => {
  const repository = createPlatformRepository(database.get());
  for (const deniedId of [regularUserId, blockedAdminId]) {
    expect(await repository.readAdminSettings(deniedId)).toBeUndefined();
    expect(await repository.listAudit({ adminUserId: deniedId, limit: 10 })).toBeUndefined();
    expect(
      await repository.updateSetting({
        ...command("first_order_cash_cap_dzd", { value: 3500, reason }, "denied-setting"),
        key: "first_order_cash_cap_dzd",
        adminUserId: deniedId,
      }),
    ).toEqual({ kind: "forbidden" });
    expect(
      await repository.updateFlag({
        ...command("online_payments", { isEnabled: true, reason }, "denied-flag"),
        adminUserId: deniedId,
      }),
    ).toEqual({ kind: "forbidden" });
  }
});

test("[ADM-08:db] validates settings per key and changes subscription values without changing other billing settings", async () => {
  const repository = createPlatformRepository(database.get());
  const { sql } = database.get();
  await sql`UPDATE billing_settings SET due_days = 16, tax_rate_basis_points = 10000 WHERE singleton`;
  for (const { key, value } of [
    { key: "order_accept_timeout_seconds", value: 0 },
    { key: "first_order_cash_cap_dzd", value: null },
    { key: "subscription_trial_days", value: 366 },
    { key: "subscription_price_dzd", value: 2_147_483_647 },
    { key: "maintenance_banner", value: 14 },
  ] as const) {
    expect(
      await repository.updateSetting({
        ...command(key, { value, reason }, `invalid-${key}`),
        key,
      }),
    ).toEqual({ kind: "invalid_setting_value" });
  }
  const update = await repository.updateSetting({
    ...command("subscription_price_dzd", { value: 500, reason }, "price"),
    key: "subscription_price_dzd",
  });
  expect(update).toMatchObject({
    kind: "applied",
    value: { settings: { subscription_price_dzd: 500 } },
  });
  expect(
    await sql`SELECT price_dzd, due_days, tax_rate_basis_points FROM billing_settings`,
  ).toEqual([{ price_dzd: 500, due_days: 16, tax_rate_basis_points: 10000 }]);
});

test("[ADM-08:db] only publishes allowlisted global flags and matching city scopes", async () => {
  const repository = createPlatformRepository(database.get());
  const { sql } = database.get();
  await sql`
    INSERT INTO feature_flags (key, is_enabled, scope)
    VALUES ('private_staff_tool', true, NULL), ('ordering:invalid', true, NULL),
      (${`ordering:${invalidCityId}`}, true, ${JSON.stringify({ cityId })}::jsonb)
  `;
  const city = await repository.updateFlag(
    command(`ordering:${cityId.toUpperCase()}`, { isEnabled: true, reason }, "city"),
  );
  expect(city).toEqual({
    kind: "applied",
    value: {
      key: `ordering:${cityId}`,
      isEnabled: true,
      scope: { cityId },
      updatedAt: now.toISOString(),
    },
  });
  const privateFlag = await repository.updateFlag(
    command("subscription_online_payment", { isEnabled: true, reason }, "private"),
  );
  expect(privateFlag).toMatchObject({ kind: "applied", value: { isEnabled: true, scope: null } });
  expect(await sql`SELECT subscription_online_payment_enabled FROM billing_settings`).toEqual([
    { subscription_online_payment_enabled: true },
  ]);
  await expect(repository.readPublicFlags()).resolves.toEqual({
    flags: {
      menu_photo_import: false,
      online_payments: false,
      ramadan_mode: false,
      ordering: { [cityId]: true },
    },
    maintenanceBanner: null,
  });
});

test("[ADM-01:db] retries audit once and replays the original snapshot after later writes", async () => {
  const repository = createPlatformRepository(database.get());
  const write = {
    ...command("maintenance_banner", { value: banner, reason }, "same"),
    key: "maintenance_banner" as const,
  };
  const results = await Promise.all([
    repository.updateSetting(write),
    repository.updateSetting(write),
  ]);
  expect(results.map(({ kind }) => kind).sort()).toEqual(["applied", "replayed"]);
  const applied = results.find(({ kind }) => kind === "applied");
  expect(applied).toMatchObject({
    kind: "applied",
    value: { settings: { maintenance_banner: banner } },
  });
  expect(await repository.readPublicFlags()).toMatchObject({ maintenanceBanner: banner });
  const clear = {
    ...command("maintenance_banner", { value: null, reason }, "clear"),
    key: write.key,
  };
  expect(await repository.updateSetting(clear)).toMatchObject({
    kind: "applied",
    value: { settings: { maintenance_banner: null } },
  });
  expect(await repository.updateSetting(write)).toEqual({ ...applied, kind: "replayed" });
  expect(
    await repository.updateSetting({ ...clear, idempotencyKeyHash: write.idempotencyKeyHash }),
  ).toEqual({ kind: "idempotency_conflict" });
  expect(await repository.readPublicFlags()).toMatchObject({ maintenanceBanner: null });
  const { sql } = database.get();
  expect(
    await sql`
    SELECT diff FROM platform_command_receipts WHERE entity_id = 'maintenance_banner'
    ORDER BY id
  `,
  ).toEqual([{ diff: { before: null, after: banner } }, { diff: { before: banner, after: null } }]);
});

test("[ADM-09:db] pages all same-instant audit events by timestamp and id with filters", async () => {
  const repository = createPlatformRepository(database.get());
  const query = {
    adminUserId,
    actorId: adminUserId,
    entity: "flag" as const,
    from: now.toISOString(),
    limit: 1,
  };
  await repository.updateFlag(
    command("online_payments", { isEnabled: true, reason }, "audit-flag-one"),
  );
  await repository.updateFlag(
    command("ramadan_mode", { isEnabled: true, reason }, "audit-flag-two"),
  );
  const first = await repository.listAudit(query);
  expect(first?.events).toMatchObject([
    {
      actorId: adminUserId,
      entity: "flag",
      entityId: "ramadan_mode",
      action: "flag_updated",
      reason,
      createdAt: now.toISOString(),
    },
  ]);
  if (!first?.nextCursor) throw new Error("Expected the next audit cursor.");
  const second = await repository.listAudit({ ...query, cursor: first.nextCursor });
  expect(second?.events).toMatchObject([{ entityId: "online_payments" }]);
  expect(await repository.listAudit({ ...query, actorId: regularUserId })).toEqual({
    events: [],
    nextCursor: null,
  });
  expect(await repository.listAudit({ ...query, from: undefined, to: now.toISOString() })).toEqual({
    events: [],
    nextCursor: null,
  });
});

test("[ADM-08:db] canonical actor IDs share one replay lock", async () => {
  const { sql } = database.get();
  const repository = createPlatformRepository(database.get());
  const holder = openDatabase(database.url());
  const write = command("ramadan_mode", { isEnabled: true, reason }, "canonical-actor");
  let pending: Promise<Awaited<ReturnType<typeof repository.updateFlag>>[]> | undefined;
  try {
    await holder.sql.begin(async (tx) => {
      await tx`LOCK TABLE feature_flags IN ACCESS EXCLUSIVE MODE`;
      const [backend] = await tx<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      if (!backend) throw new Error("Missing lock holder PID");
      pending = Promise.all([
        repository.updateFlag(write),
        repository.updateFlag({ ...write, adminUserId: adminUserId.toUpperCase() }),
      ]);
      const blockedByHolder = await vi.waitFor(
        async () => {
          const waiting = await sql<{ direct: boolean }[]>`
            SELECT ${backend.pid} = ANY(pg_blocking_pids(pid)) AS direct
            FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
          `;
          expect(waiting).toHaveLength(2);
          return waiting.filter(({ direct }) => direct).length;
        },
        { timeout: 2_000 },
      );
      expect(blockedByHolder).toBe(1);
    });
    expect((await pending)?.map(({ kind }) => kind).sort()).toEqual(["applied", "replayed"]);
  } finally {
    await pending?.catch(() => undefined);
    await holder.close();
  }
});
