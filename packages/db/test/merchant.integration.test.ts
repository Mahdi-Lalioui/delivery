import { createHash } from "node:crypto";
import { beforeAll, expect, test, vi } from "vitest";
import { openDatabase } from "../src/database.ts";
import { createMediaRepository } from "../src/media.ts";
import { createMerchantRepository } from "../src/merchant.ts";
import { registerTestDatabase } from "./database.ts";
import { seedReadyPhoto } from "./ready-photo.ts";

type Repository = ReturnType<typeof createMerchantRepository>;
type Submission = Parameters<Repository["submitApplication"]>[0];
type Review = Parameters<Repository["reviewApplication"]>[0];

const database = registerTestDatabase();
const now = new Date("2026-11-07T12:00:00.000Z");

function fixtureId(serial: number): string {
  return `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
}

const westCommune = fixtureId(1);
const eastCommune = fixtureId(2);

beforeAll(async () => {
  const { sql } = database.get();
  await sql`
    insert into wilayas (code, name_ar, name_fr)
    values (16, 'ولاية تجريبية', 'Wilaya de test') on conflict (code) do nothing
  `;
  const communes = [
    { id: westCommune, code: "1698", west: 3.04, east: 3.06 },
    { id: eastCommune, code: "1699", west: 3.06, east: 3.08 },
  ];
  for (const { id, code, west, east } of communes) {
    await sql`
      insert into communes (id, code, wilaya_code, name_ar, name_fr, centroid, boundary)
      select ${id}, ${code}, 16, 'بلدية تجريبية', 'Commune de test',
        st_centroid(polygon)::geography, polygon
      from (select st_multi(st_makeenvelope(${west}, 36.75, ${east}, 36.78, 4326)) as polygon) shape
    `;
  }
});

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

async function account(serial: number) {
  const id = fixtureId(serial);
  const phone = `+2135${String(serial).padStart(8, "0")}`;
  const { sql } = database.get();
  await sql`
    insert into users (id, phone_e164, created_at)
    values (${id}, ${phone}, ${now.toISOString()}::timestamptz)
  `;
  return { id, phone };
}

async function administrator(serial: number) {
  const user = await account(serial);
  const { sql } = database.get();
  await sql`
    insert into admins (user_id, totp_secret_encrypted)
    values (${user.id}, ${hash(`fixture admin ${String(serial)}`)})
  `;
  return user;
}

function submission(serial: number, accountId: string): Submission {
  const input = {
    restaurantName: `Restaurant fictif ${String(serial)}`,
    ownerName: "Propriétaire de test",
    communeId: westCommune,
    pin: { latitude: 36.765, longitude: 3.05 },
    cuisines: ["algerian", "grill"],
    rcNumber: "22B1234567",
  };
  return {
    accountId,
    input,
    now,
    idempotencyKeyHash: hash(`fixture-merchant-key-${String(serial)}`),
    requestHash: hash(JSON.stringify(input)),
  };
}

function repository() {
  return createMerchantRepository(database.get());
}

function amend(request: Submission, changes: Partial<Submission["input"]>): Submission {
  const input = { ...request.input, ...changes };
  return { ...request, input, requestHash: hash(JSON.stringify(input)) };
}

async function createApplication(request: Submission) {
  const result = await repository().submitApplication(request);
  if (result.kind !== "created") throw new Error(`Expected merchant creation, got ${result.kind}`);
  return result.merchantId;
}

async function concurrently<Left, Right>(
  left: (repo: Repository) => Promise<Left>,
  right: (repo: Repository) => Promise<Right>,
) {
  const connection = openDatabase(database.url());
  try {
    return await Promise.all([left(repository()), right(createMerchantRepository(connection))]);
  } finally {
    await connection.close();
  }
}

function review(
  serial: number,
  input: Pick<Review, "adminUserId" | "merchantId" | "decision">,
): Review {
  const reason = `Fixture review decision ${String(serial)}`;
  return {
    ...input,
    reason,
    now,
    idempotencyKeyHash: hash(`fixture-review-key-${String(serial)}`),
    requestHash: hash(
      JSON.stringify({ merchantId: input.merchantId, decision: input.decision, reason }),
    ),
  };
}

test("[MER-01:db] signup persists verified phone, the selected pin, owner membership and notice", async () => {
  const owner = await account(100);
  const request = submission(100, owner.id);
  const result = await repository().submitApplication(request);
  expect(result).toMatchObject({ kind: "created", status: "pending_review" });
  if (result.kind !== "created") throw new Error("Expected a new merchant");

  const { sql } = database.get();
  const [merchant] = await sql`
    select phone_e164, commune_id, status, is_demo,
      st_x(location::geometry) as longitude, st_y(location::geometry) as latitude
    from merchants where id = ${result.merchantId}
  `;
  expect(merchant).toEqual({
    phone_e164: owner.phone,
    commune_id: westCommune,
    status: "pending_review",
    is_demo: false,
    ...request.input.pin,
  });
  const members = await sql`
    select user_id, role from merchant_members where merchant_id = ${result.merchantId}
  `;
  expect([...members]).toEqual([{ user_id: owner.id, role: "owner" }]);
  expect(
    await sql`select merchant_id from merchant_review_notices where merchant_id = ${result.merchantId}`,
  ).toHaveLength(1);
});

test("[MER-01:db] a commune covers its border but excludes the adjacent commune's interior", async () => {
  const owner = await account(200);
  const request = submission(200, owner.id);
  const repo = repository();

  expect(await repo.submitApplication(amend(request, { communeId: fixtureId(99) }))).toEqual({
    kind: "invalid_commune",
  });
  expect(await repo.submitApplication(amend(request, { communeId: eastCommune }))).toEqual({
    kind: "outside_commune",
  });
  expect(
    await repo.submitApplication(amend(request, { pin: { latitude: 36.765, longitude: 3.06 } })),
  ).toMatchObject({
    kind: "created",
    status: "pending_review",
  });
});

test("[MER-01:db] blocked, deleted and unknown accounts cannot submit", async () => {
  const blocked = await account(300);
  const deleted = await account(301);
  const { sql } = database.get();
  await sql`update users set blocked_at = ${now.toISOString()}::timestamptz where id = ${blocked.id}`;
  await sql`update users set deleted_at = ${now.toISOString()}::timestamptz where id = ${deleted.id}`;

  for (const accountId of [blocked.id, deleted.id, fixtureId(302)]) {
    expect(await repository().submitApplication(submission(300, accountId))).toEqual({
      kind: "account_unavailable",
    });
  }
});

test("[MER-01:db] concurrent exact signup replay creates one merchant, owner membership and notice", async () => {
  const owner = await account(400);
  const request = submission(400, owner.id);
  const results = await concurrently(
    (repo) => repo.submitApplication(request),
    (repo) => repo.submitApplication(request),
  );
  expect(results.map(({ kind }) => kind).sort()).toEqual(["created", "replayed"]);
  const created = results.find((result) => result.kind === "created");
  if (!created || created.kind !== "created") throw new Error("Expected one new merchant");
  expect(results).toContainEqual({
    kind: "replayed",
    merchantId: created.merchantId,
    status: "pending_review",
  });

  const { sql } = database.get();
  expect(
    await sql`select id from merchants where restaurant_name = ${request.input.restaurantName}`,
  ).toHaveLength(1);
  const memberships =
    await sql`select merchant_id, role from merchant_members where user_id = ${owner.id}`;
  expect([...memberships]).toEqual([{ merchant_id: created.merchantId, role: "owner" }]);
  expect(
    await sql`select merchant_id from merchant_review_notices where merchant_id = ${created.merchantId}`,
  ).toHaveLength(1);
});

test("[MER-01:db] signup keys are account-scoped and bind the original request", async () => {
  const owner = await account(500);
  const other = await account(501);
  const request = submission(500, owner.id);
  const merchantId = await createApplication(request);
  expect(
    await repository().submitApplication(
      amend(request, { restaurantName: "Different fixture name" }),
    ),
  ).toEqual({
    kind: "idempotency_conflict",
  });

  const independent = {
    ...submission(501, other.id),
    idempotencyKeyHash: request.idempotencyKeyHash,
  };
  expect(await createApplication(independent)).not.toBe(merchantId);
});

test("[MER-01:db] application photos retain their order, private scope and replay behavior", async () => {
  const owner = await account(510);
  const outsider = await account(511);
  const photoIds = [fixtureId(519), fixtureId(518)];
  const { sql } = database.get();
  for (const mediaId of photoIds) {
    await seedReadyPhoto(sql, { mediaId, accountId: owner.id, kind: "application", now });
  }
  const request = amend(submission(510, owner.id), { photoIds });
  const results = await concurrently(
    (repo) => repo.submitApplication(request),
    (repo) => repo.submitApplication(request),
  );
  expect(results.map(({ kind }) => kind).sort()).toEqual(["created", "replayed"]);
  const created = results.find((result) => result.kind === "created");
  if (!created || created.kind !== "created") throw new Error("Expected an application.");

  const rows = await sql`
    select attachment.media_id, upload.merchant_id, upload.kind, upload.owner_id
    from merchant_application_photos as attachment
    join media_uploads as upload on upload.id = attachment.media_id
    where attachment.merchant_id = ${created.merchantId}
    order by attachment.sort
  `;
  expect(rows).toEqual(
    photoIds.map((mediaId) => ({
      media_id: mediaId,
      merchant_id: null,
      kind: "application",
      owner_id: owner.id,
    })),
  );
  expect(
    await repository().submitApplication(amend(request, { photoIds: [...photoIds].reverse() })),
  ).toEqual({ kind: "idempotency_conflict" });

  const [mediaId] = photoIds;
  if (!mediaId) throw new Error("Expected an application photo.");
  const sessionId = fixtureId(512);
  await sql`
    insert into sessions
      (id, user_id, token_hash, transport, kind, request_ip, created_at, last_seen_at, expires_at)
    values (${sessionId}, ${outsider.id}, ${hash(sessionId)}, 'web', 'standard', '192.0.2.1',
      ${now.toISOString()}, ${now.toISOString()}, ${now.toISOString()}::timestamptz + interval '1 hour')
  `;
  const media = createMediaRepository(database.get());
  await expect(
    media.findVariant({
      accountId: outsider.id,
      sessionId,
      now,
      mediaId,
      format: "webp",
      width: 160,
    }),
  ).resolves.toBeUndefined();
});

test("[MER-01:db] an unavailable application photo leaves the entire command retryable", async () => {
  const owner = await account(520);
  const outsider = await account(521);
  const ready = fixtureId(525);
  const foreign = fixtureId(526);
  const awaitingUpload = fixtureId(527);
  const { sql } = database.get();
  await seedReadyPhoto(sql, { mediaId: ready, accountId: owner.id, kind: "application", now });
  await seedReadyPhoto(sql, {
    mediaId: foreign,
    accountId: outsider.id,
    kind: "application",
    now,
  });
  await sql`
    insert into media_uploads (id, owner_id, kind, content_type, bytes, created_at)
    values (${awaitingUpload}, ${owner.id}, 'application', 'image/png', 16, ${now.toISOString()})
  `;
  const merchantId = await createApplication(submission(521, outsider.id));
  const itemPhoto = fixtureId(528);
  await seedReadyPhoto(sql, {
    mediaId: itemPhoto,
    accountId: owner.id,
    merchantId,
    kind: "item",
    now,
  });

  const request = submission(520, owner.id);
  for (const unavailable of [foreign, awaitingUpload, itemPhoto, fixtureId(529), ready]) {
    const input = amend(request, { photoIds: [ready, unavailable] });
    expect(await repository().submitApplication(input)).toEqual({ kind: "photos_unavailable" });
  }
  expect(await sql`select from merchant_members where user_id = ${owner.id}`).toHaveLength(0);
  await expect(
    repository().submitApplication(amend(request, { photoIds: [ready] })),
  ).resolves.toMatchObject({ kind: "created", status: "pending_review" });
});

test("[MER-01:db] a failed notice rolls back the application, photo attachment, membership and receipt", async () => {
  const owner = await account(600);
  const mediaId = fixtureId(601);
  const request = amend(submission(600, owner.id), { photoIds: [mediaId] });
  const { sql } = database.get();
  await seedReadyPhoto(sql, { mediaId, accountId: owner.id, kind: "application", now });
  await sql`
    create function reject_fixture_merchant_notice() returns trigger language plpgsql as $$
    begin
      raise exception 'fixture merchant notice failed';
    end;
    $$
  `;
  await sql`
    create trigger reject_fixture_merchant_notice before insert on merchant_review_notices
    for each row execute function reject_fixture_merchant_notice()
  `;
  try {
    await expect(repository().submitApplication(request)).rejects.toThrow(
      /fixture merchant notice failed/,
    );
  } finally {
    await sql`drop trigger reject_fixture_merchant_notice on merchant_review_notices`;
    await sql`drop function reject_fixture_merchant_notice()`;
  }

  expect(
    await sql`select id from merchants where restaurant_name = ${request.input.restaurantName}`,
  ).toHaveLength(0);
  expect(
    await sql`select from merchant_application_photos where media_id = ${mediaId}`,
  ).toHaveLength(0);
  expect(await repository().listMemberships({ accountId: owner.id })).toEqual([]);
  expect(await repository().submitApplication(request)).toMatchObject({ kind: "created" });
});

test("[AUTH-07:db] management uses the actor's role at the target merchant", async () => {
  const actor = await account(700);
  const other = await account(701);
  const outside = await account(702);
  const owned = submission(700, actor.id);
  const managed = submission(701, other.id);
  const staffed = submission(702, other.id);
  const ownedId = await createApplication(owned);
  const managedId = await createApplication(managed);
  const staffedId = await createApplication(staffed);
  const { sql } = database.get();
  await sql`
    insert into merchant_members (merchant_id, user_id, role)
    values (${managedId}, ${actor.id}, 'manager'), (${staffedId}, ${actor.id}, 'staff')
  `;

  const repo = repository();
  const memberships = await repo.listMemberships({ accountId: actor.id });
  expect(memberships).toHaveLength(3);
  expect(memberships).toEqual(
    expect.arrayContaining([
      {
        merchantId: ownedId,
        restaurantName: owned.input.restaurantName,
        status: "pending_review",
        role: "owner",
      },
      {
        merchantId: managedId,
        restaurantName: managed.input.restaurantName,
        status: "pending_review",
        role: "manager",
      },
      {
        merchantId: staffedId,
        restaurantName: staffed.input.restaurantName,
        status: "pending_review",
        role: "staff",
      },
    ]),
  );
  expect(
    await repo.findManagedMerchant({ accountId: actor.id, merchantId: ownedId }),
  ).toMatchObject({ merchantId: ownedId, role: "owner" });
  expect(
    await repo.findManagedMerchant({ accountId: actor.id, merchantId: managedId }),
  ).toMatchObject({ merchantId: managedId, role: "manager" });
  expect(
    await repo.findManagedMerchant({ accountId: actor.id, merchantId: staffedId }),
  ).toBeUndefined();
  expect(
    await repo.findManagedMerchant({ accountId: outside.id, merchantId: ownedId }),
  ).toBeUndefined();
});

test("[ADM-03:db] review requires current admin enrollment and an existing pending merchant", async () => {
  const owner = await account(800);
  const admin = await administrator(801);
  const merchantId = await createApplication(submission(800, owner.id));
  const request = review(800, { adminUserId: admin.id, merchantId, decision: "approve" });

  expect(await repository().reviewApplication({ ...request, adminUserId: owner.id })).toEqual({
    kind: "forbidden",
  });
  expect(await repository().reviewApplication({ ...request, merchantId: fixtureId(99) })).toEqual({
    kind: "not_found",
  });
  const { sql } = database.get();
  const [merchant] = await sql`select status, reviewed_at from merchants where id = ${merchantId}`;
  expect(merchant).toEqual({ status: "pending_review", reviewed_at: null });
  expect(
    await sql`select merchant_id from audit_log where merchant_id = ${merchantId}`,
  ).toHaveLength(0);
});

test.each([
  ["approve", "approved", 900],
  ["reject", "rejected", 1_000],
] as const)(
  "[ADM-03:db] concurrent exact %s retry writes one audit entry and retains the original time",
  async (decision, status, serial) => {
    const owner = await account(serial);
    const admin = await administrator(serial + 1);
    const merchantId = await createApplication(submission(serial, owner.id));
    const request = review(serial, { adminUserId: admin.id, merchantId, decision });
    const results = await concurrently(
      (repo) => repo.reviewApplication(request),
      (repo) => repo.reviewApplication(request),
    );
    expect(results.map(({ kind }) => kind).sort()).toEqual(["replayed", "reviewed"]);
    expect(results).toContainEqual({ kind: "reviewed", merchantId, status, reviewedAt: now });
    expect(results).toContainEqual({ kind: "replayed", merchantId, status, reviewedAt: now });

    const repo = repository();
    expect(
      await repo.reviewApplication({ ...request, now: new Date(now.getTime() + 1_000) }),
    ).toEqual({
      kind: "replayed",
      merchantId,
      status,
      reviewedAt: now,
    });
    expect(
      await repo.reviewApplication({
        ...request,
        reason: "Changed reason",
        requestHash: hash("changed review"),
      }),
    ).toEqual({
      kind: "idempotency_conflict",
    });
    expect(
      await repo.reviewApplication({ ...request, idempotencyKeyHash: hash("another key") }),
    ).toEqual({ kind: "invalid_status" });

    const { sql } = database.get();
    const [merchant] = await sql`
    select status, reviewed_at = ${now.toISOString()}::timestamptz as reviewed_on_time
    from merchants where id = ${merchantId}
  `;
    expect(merchant).toEqual({ status, reviewed_on_time: true });
    const audit = await sql`
    select actor_id, merchant_id, action, reason, created_at = ${now.toISOString()}::timestamptz as audited_on_time
    from audit_log where merchant_id = ${merchantId}
  `;
    expect([...audit]).toEqual([
      {
        actor_id: admin.id,
        merchant_id: merchantId,
        action: `merchant_${status}`,
        reason: request.reason,
        audited_on_time: true,
      },
    ]);
  },
);

test("[ADM-03:db] competing administrators cannot both decide the same pending application", async () => {
  const owner = await account(1_100);
  const first = await administrator(1_101);
  const second = await administrator(1_102);
  const merchantId = await createApplication(submission(1_100, owner.id));
  const approve = review(1_100, { adminUserId: first.id, merchantId, decision: "approve" });
  const reject = review(1_101, { adminUserId: second.id, merchantId, decision: "reject" });
  const [approval, rejection] = await concurrently(
    (repo) => repo.reviewApplication(approve),
    (repo) => repo.reviewApplication(reject),
  );
  expect([approval.kind, rejection.kind].sort()).toEqual(["invalid_status", "reviewed"]);
  const winner = approval.kind === "reviewed" ? approve : reject;
  const status = winner.decision === "approve" ? "approved" : "rejected";

  const { sql } = database.get();
  const [merchant] = await sql`select status from merchants where id = ${merchantId}`;
  expect(merchant).toEqual({ status });
  const audit =
    await sql`select actor_id, action, reason from audit_log where merchant_id = ${merchantId}`;
  expect([...audit]).toEqual([
    { actor_id: winner.adminUserId, action: `merchant_${status}`, reason: winner.reason },
  ]);
});

test("[MER-01:db] paginates communes by stable code within a wilaya", async () => {
  const repo = repository();
  const first = await repo.listCommunes({ wilayaCode: 16, limit: 1 });
  expect(first.communes).toEqual([
    {
      id: westCommune,
      code: "1698",
      wilayaCode: 16,
      nameAr: "بلدية تجريبية",
      nameFr: "Commune de test",
    },
  ]);
  expect(first.nextCursor).toBe("1698");
  const last = await repo.listCommunes({ wilayaCode: 16, cursor: "1698", limit: 1 });
  expect(last.communes.map(({ id }) => id)).toEqual([eastCommune]);
  expect(last.nextCursor).toBeNull();
  expect(await repo.listCommunes({ wilayaCode: 17, limit: 1 })).toEqual({
    communes: [],
    nextCursor: null,
  });
});

test("[ADM-03:db] paginates the review queue by time and ID for a current admin", async () => {
  const owner = await account(1_300);
  const admin = await administrator(1_301);
  const later = new Date(now.getTime() + 60_000);
  const firstId = await createApplication({ ...submission(1_300, owner.id), now: later });
  const secondId = await createApplication({ ...submission(1_301, owner.id), now: later });
  const newest = [firstId, secondId].sort().reverse();
  const { sql } = database.get();
  await sql`UPDATE merchants SET created_at = ${later.toISOString()}::timestamptz
    + CASE WHEN id = ${newest[0] ?? ""} THEN interval '200 microseconds' ELSE interval '100 microseconds' END
    WHERE id IN (${firstId}, ${secondId})`;

  const repo = repository();
  expect(await repo.listPendingApplications({ adminUserId: owner.id, limit: 1 })).toBeUndefined();
  const first = await repo.listPendingApplications({ adminUserId: admin.id, limit: 1 });
  expect(first?.applications).toMatchObject([
    {
      merchantId: newest[0],
      phoneE164: owner.phone,
      submittedAt: later.toISOString(),
      commune: { id: westCommune, nameAr: "بلدية تجريبية", nameFr: "Commune de test" },
      pin: { latitude: 36.765, longitude: 3.05 },
    },
  ]);
  expect(first?.nextCursor).toBe(later.toISOString() + "~" + (newest[0] ?? ""));
  const leading = first?.applications[0];
  if (!leading) throw new Error("Expected a pending application");
  const next = await repo.listPendingApplications({
    adminUserId: admin.id,
    limit: 1,
    cursor: { submittedAt: leading.submittedAt, merchantId: leading.merchantId },
  });
  expect(next?.applications.map(({ merchantId }) => merchantId)).toEqual([newest[1]]);
});

test("[MER-01:db] admin notices follow durable pending applications across signup, replay and review", async () => {
  const owner = await account(1_500);
  const admin = await administrator(1_501);
  const repo = repository();
  const baseline = await repo.readApplicationNotice(admin.id);
  if (!baseline) throw new Error("Expected the existing admin notice summary.");

  const firstAt = new Date(now.getTime() + 120_000);
  const first = { ...submission(1_500, owner.id), now: firstAt };
  const firstId = await createApplication(first);
  const firstNotice = { pendingCount: baseline.pendingCount + 1, latestMerchantId: firstId };
  expect(await repo.readApplicationNotice(admin.id)).toEqual(firstNotice);
  expect(await repo.submitApplication(first)).toMatchObject({
    kind: "replayed",
    merchantId: firstId,
  });
  expect(await repo.readApplicationNotice(admin.id)).toEqual(firstNotice);

  const secondAt = new Date(now.getTime() + 180_000);
  const secondId = await createApplication({ ...submission(1_501, owner.id), now: secondAt });
  const { sql } = database.get();
  const withoutNotice = fixtureId(1_502);
  await sql`
    INSERT INTO merchants (id, slug, restaurant_name, owner_name, phone_e164,
      commune_id, location, cuisines, status, created_at)
    SELECT ${withoutNotice}, 'fixture-without-notice', restaurant_name, owner_name, phone_e164,
      commune_id, location, cuisines, status, created_at + interval '1 second'
    FROM merchants WHERE id = ${secondId}
  `;
  expect(await repo.readApplicationNotice(admin.id)).toEqual({
    pendingCount: baseline.pendingCount + 2,
    latestMerchantId: secondId,
  });

  const rejectSecond = review(1_501, {
    adminUserId: admin.id,
    merchantId: secondId,
    decision: "reject",
  });
  const approveFirst = review(1_500, {
    adminUserId: admin.id,
    merchantId: firstId,
    decision: "approve",
  });
  expect(await repo.reviewApplication({ ...rejectSecond, now: secondAt })).toMatchObject({
    kind: "reviewed",
  });
  expect(await repo.readApplicationNotice(admin.id)).toEqual(firstNotice);
  expect(await repo.reviewApplication({ ...approveFirst, now: firstAt })).toMatchObject({
    kind: "reviewed",
  });
  expect(await repo.readApplicationNotice(admin.id)).toEqual(baseline);
  expect(
    await sql`SELECT FROM merchant_review_notices WHERE merchant_id IN (${firstId}, ${secondId})`,
  ).toHaveLength(2);
});

test("[MER-01:db] notice summaries require a current unblocked admin enrollment", async () => {
  const owner = await account(1_510);
  const blocked = await administrator(1_511);
  const deleted = await administrator(1_512);
  const { sql } = database.get();
  await sql`UPDATE users SET blocked_at = ${now.toISOString()} WHERE id = ${blocked.id}`;
  await sql`UPDATE users SET deleted_at = ${now.toISOString()} WHERE id = ${deleted.id}`;

  const repo = repository();
  for (const adminUserId of [owner.id, blocked.id, deleted.id]) {
    await expect(repo.readApplicationNotice(adminUserId)).resolves.toBeUndefined();
  }
});

test("[MER-01:db] UUID spelling does not split the application replay lock", async () => {
  const owner = await account(1_400);
  const request = submission(1_400, owner.id);
  const holder = openDatabase(database.url());
  const { sql } = database.get();
  let pending: Promise<Awaited<ReturnType<Repository["submitApplication"]>>[]> | undefined;
  try {
    await holder.sql.begin(async (tx) => {
      await tx`LOCK TABLE merchant_review_notices IN ACCESS EXCLUSIVE MODE`;
      const [holderBackend] = await tx<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      if (!holderBackend) throw new Error("Missing lock holder PID");
      pending = concurrently(
        (repo) => repo.submitApplication(request),
        (repo) => repo.submitApplication({ ...request, accountId: owner.id.toUpperCase() }),
      );
      const blockedByHolder = await vi.waitFor(
        async () => {
          const waiting = await sql<{ direct: boolean }[]>`
          SELECT ${holderBackend.pid} = ANY(pg_blocking_pids(pid)) AS direct
          FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
        `;
          expect(waiting).toHaveLength(2);
          return waiting.filter(({ direct }) => direct).length;
        },
        { timeout: 2_000 },
      );
      expect(blockedByHolder).toBe(1);
    });
    expect((await pending)?.map(({ kind }) => kind).sort()).toEqual(["created", "replayed"]);
  } finally {
    await pending?.catch(() => undefined);
    await holder.close();
  }
});

test("[ADM-03:db] review locks the user row before waiting on the admin factor row", async () => {
  const owner = await account(1_410);
  const admin = await administrator(1_411);
  const merchantId = await createApplication(submission(1_410, owner.id));
  const request = review(1_410, { adminUserId: admin.id, merchantId, decision: "approve" });
  const holder = openDatabase(database.url());
  const { sql } = database.get();
  let pending: ReturnType<Repository["reviewApplication"]> | undefined;
  try {
    await holder.sql.begin(async (tx) => {
      await tx`SELECT user_id FROM admins WHERE user_id = ${admin.id} FOR UPDATE`;
      const [holderBackend] = await tx<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      if (!holderBackend) throw new Error("Missing lock holder PID");
      pending = repository().reviewApplication(request);
      await vi.waitFor(
        async () => {
          const [waiting] = await sql<{ blocked: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
            AND ${holderBackend.pid} = ANY(pg_blocking_pids(pid))) AS blocked
        `;
          expect(waiting?.blocked).toBe(true);
        },
        { timeout: 2_000 },
      );
      await expect(
        sql`SELECT id FROM users WHERE id = ${admin.id} FOR UPDATE NOWAIT`,
      ).rejects.toMatchObject({ code: "55P03" });
    });
    expect(await pending).toMatchObject({ kind: "reviewed", merchantId });
  } finally {
    await pending?.catch(() => undefined);
    await holder.close();
  }
});
