import { createHash } from "node:crypto";
import { runMigrations } from "graphile-worker";
import { beforeAll, expect, test } from "vitest";
import { openDatabase } from "../src/database.ts";
import { createMediaRepository } from "../src/media.ts";
import { registerTestDatabase } from "./database.ts";

type Repository = ReturnType<typeof createMediaRepository>;
type Reservation = Parameters<Repository["reserve"]>[0];
type Upload = Parameters<Repository["acceptUpload"]>[0];

const database = registerTestDatabase();
const now = new Date("2026-11-07T12:00:00.000Z");
const nextMinute = new Date(now.getTime() + 60_000);
const expiresAt = new Date(now.getTime() + 3_600_000);
const png = { contentType: "image/png", bytes: 16 } as const;
const application = { ...png, kind: "application" } as const;

const hash = (value: string) => createHash("sha256").update(value).digest();
const repo = () => createMediaRepository(database.get());
const fixtureId = (serial: number) => `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
const communeId = fixtureId(1);

beforeAll(async () => {
  const { sql } = database.get();
  await runMigrations({ connectionString: database.url(), schema: "graphile_worker" });
  await sql`
    INSERT INTO public.wilayas (code, name_ar, name_fr)
    VALUES (16, 'تجريبي', 'Test') ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO public.communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    VALUES (${communeId}, '1699', 16, 'تجريبي', 'Test', ST_SetSRID(ST_MakePoint(3.05, 36.76), 4326))
  `;
});

async function session(accountId: string, serial: number, kind: "standard" | "admin" = "standard") {
  const sessionId = fixtureId(serial);
  const { sql } = database.get();
  await sql`
    INSERT INTO public.sessions
      (id, user_id, token_hash, transport, kind, request_ip, created_at, last_seen_at, expires_at)
    VALUES (${sessionId}, ${accountId}, ${hash(sessionId)}, 'web', ${kind}, '192.0.2.1',
      ${now.toISOString()}, ${now.toISOString()}, ${expiresAt.toISOString()})
  `;
  return { accountId, sessionId, now };
}

async function actor(serial: number) {
  const accountId = fixtureId(serial);
  const { sql } = database.get();
  await sql`
    INSERT INTO public.users (id, phone_e164, created_at)
    VALUES (${accountId}, ${`+2135${String(serial).padStart(8, "0")}`}, ${now.toISOString()})
  `;
  return session(accountId, serial + 10_000);
}

async function restaurant(serial: number) {
  const merchantId = fixtureId(serial);
  const { sql } = database.get();
  await sql`
    INSERT INTO public.merchants
      (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at)
    VALUES (${merchantId}, ${`fixture-${merchantId}`}, 'Test', 'Fixture', '+213500000000', ${communeId},
      ST_SetSRID(ST_MakePoint(3.05, 36.76), 4326), ${["algerian"]}, 'approved', ${now.toISOString()})
  `;
  return merchantId;
}

async function membership(
  merchantId: string,
  accountId: string,
  role: "owner" | "manager" | "staff",
) {
  const { sql } = database.get();
  await sql`
    INSERT INTO public.merchant_members (merchant_id, user_id, role)
    VALUES (${merchantId}, ${accountId}, ${role})
  `;
}

function reserveRequest(
  scope: Pick<Reservation, "accountId" | "sessionId" | "now">,
  input: Reservation["input"] = application,
): Reservation {
  return {
    ...scope,
    input,
    idempotencyKeyHash: hash("fixture-key"),
    requestHash: hash(JSON.stringify(input)),
  };
}

async function reserve(request: Reservation) {
  const result = await repo().reserve(request);
  if (result.kind !== "created") throw new Error("Expected a new fixture reservation");
  return {
    accountId: request.accountId,
    sessionId: request.sessionId,
    now: request.now,
    mediaId: result.media.mediaId,
  };
}

function upload(
  scope: Pick<Upload, "accountId" | "sessionId" | "now" | "mediaId">,
  attempt: string,
  bytes = "photo",
) {
  return {
    ...scope,
    ...png,
    quarantineKey: `quarantine/${scope.mediaId}/${attempt}`,
    digest: hash(bytes),
  };
}

async function concurrently<Result>(
  one: (repository: Repository) => Promise<Result>,
  two: (repository: Repository) => Promise<Result>,
) {
  const connection = openDatabase(database.url());
  try {
    return await Promise.all([one(repo()), two(createMediaRepository(connection))]);
  } finally {
    await connection.close();
  }
}

async function jobsFor(mediaId: string) {
  const { sql } = database.get();
  const rows = await sql`
    SELECT job.task_identifier AS identifier, job.queue_name, job.key, stored.payload
    FROM graphile_worker.jobs AS job
    JOIN graphile_worker._private_jobs AS stored USING (id)
    WHERE stored.payload ->> 'mediaId' = ${mediaId}
  `;
  return [...rows];
}

test("[MER-14:db] an exact concurrent reservation is account-scoped and binds the request hash", async () => {
  const owner = await actor(100);
  const other = await actor(101);
  const request = reserveRequest(owner);
  const results = await concurrently(
    (repository) => repository.reserve(request),
    (repository) => repository.reserve(request),
  );
  const created = results.find((result) => result.kind === "created");
  if (created?.kind !== "created") throw new Error("Expected one new reservation");
  expect(results).toContainEqual({ kind: "replayed", media: created.media });
  expect(created.media).toMatchObject({
    kind: "application",
    status: "awaiting_upload",
    sessionId: owner.sessionId,
  });

  const { sql } = database.get();
  expect(
    await sql`SELECT id FROM public.media_uploads WHERE owner_id = ${owner.accountId}`,
  ).toHaveLength(1);
  expect(
    await sql`SELECT media_id FROM public.media_command_receipts WHERE actor_id = ${owner.accountId}`,
  ).toHaveLength(1);

  const changed = reserveRequest(owner, { ...application, bytes: 17 });
  expect(await repo().reserve(changed)).toEqual({ kind: "idempotency_conflict" });
  const independent = await repo().reserve(reserveRequest(other));
  expect(independent).toMatchObject({ kind: "created" });
  expect(await repo().read({ ...other, mediaId: created.media.mediaId })).toBeUndefined();
  expect(await repo().findUpload({ ...other, mediaId: created.media.mediaId })).toBeUndefined();
  expect(
    await repo().acceptUpload(upload({ ...other, mediaId: created.media.mediaId }, "outside")),
  ).toEqual({ kind: "not_found" });

  const current = await session(owner.accountId, 1_100);
  expect(await repo().reserve(reserveRequest(current))).toEqual({
    kind: "replayed",
    media: { ...created.media, sessionId: current.sessionId },
  });
  expect(await repo().read({ ...current, mediaId: created.media.mediaId })).toEqual({
    ...created.media,
    sessionId: current.sessionId,
  });
});

test("[MER-14:db] restaurant reservations require ownership or management of that restaurant", async () => {
  const owner = await actor(200);
  const manager = await actor(201);
  const staff = await actor(202);
  const outsider = await actor(203);
  const merchantId = await restaurant(210);
  const otherMerchantId = await restaurant(211);
  await membership(merchantId, owner.accountId, "owner");
  await membership(merchantId, manager.accountId, "manager");
  await membership(merchantId, staff.accountId, "staff");
  await membership(otherMerchantId, outsider.accountId, "owner");
  const input = { ...png, kind: "cover", merchantId } as const;

  const media = await reserve(reserveRequest(manager, input));
  expect(await repo().reserve(reserveRequest(owner, input))).toMatchObject({ kind: "created" });
  expect(await repo().reserve(reserveRequest(staff, input))).toEqual({ kind: "not_found" });
  expect(await repo().reserve(reserveRequest(outsider, input))).toEqual({ kind: "not_found" });
  expect(await repo().read({ ...owner, mediaId: media.mediaId })).toBeUndefined();

  const { sql } = database.get();
  await sql`UPDATE public.merchant_members SET role = 'staff' WHERE merchant_id = ${merchantId} AND user_id = ${manager.accountId}`;
  expect(await repo().read(media)).toBeUndefined();
  expect(await repo().findUpload(media)).toBeUndefined();
  expect(await repo().reserve(reserveRequest(manager, input))).toEqual({ kind: "not_found" });
  expect(await repo().acceptUpload(upload(media, "lost-role"))).toEqual({ kind: "not_found" });
  expect(await jobsFor(media.mediaId)).toHaveLength(0);
});

test("[MER-14:db] adoption rechecks account and standard session after the upload preflight", async () => {
  const owner = await actor(300);
  const wrong = await actor(301);
  const admin = await session(owner.accountId, 1_300, "admin");
  const media = await reserve(reserveRequest(owner));
  expect(await repo().findUpload(media)).toEqual(png);
  expect(await repo().findUpload({ ...media, sessionId: wrong.sessionId })).toBeUndefined();
  expect(await repo().findUpload({ ...media, sessionId: admin.sessionId })).toBeUndefined();
  expect(await repo().acceptUpload(upload({ ...media, now: expiresAt }, "expired"))).toEqual({
    kind: "not_found",
  });

  const { sql } = database.get();
  await sql`UPDATE public.sessions SET revoked_at = ${nextMinute.toISOString()} WHERE id = ${owner.sessionId}`;
  expect(await repo().acceptUpload(upload({ ...media, now: nextMinute }, "revoked"))).toEqual({
    kind: "not_found",
  });
  const fresh = await session(owner.accountId, 1_301);
  await sql`UPDATE public.users SET blocked_at = ${nextMinute.toISOString()} WHERE id = ${owner.accountId}`;
  expect(
    await repo().acceptUpload(upload({ ...media, ...fresh, now: nextMinute }, "blocked")),
  ).toEqual({ kind: "not_found" });
  expect(await jobsFor(media.mediaId)).toHaveLength(0);
});

test("[MER-14:db] ineligible restaurant states block reserved photo access and adoption", async () => {
  const owner = await actor(310);
  const merchantId = await restaurant(311);
  await membership(merchantId, owner.accountId, "owner");
  const input = { ...png, kind: "item", merchantId } as const;
  const { sql } = database.get();
  await sql`UPDATE public.merchants SET status = 'pending_review' WHERE id = ${merchantId}`;
  expect(await repo().reserve(reserveRequest(owner, input))).toEqual({ kind: "not_found" });

  await sql`UPDATE public.merchants SET status = 'approved' WHERE id = ${merchantId}`;
  const media = await reserve(reserveRequest(owner, input));
  expect(await repo().findUpload(media)).toEqual(png);
  await sql`UPDATE public.merchants SET status = 'suspended' WHERE id = ${merchantId}`;
  expect(await repo().read(media)).toBeUndefined();
  expect(await repo().findUpload(media)).toBeUndefined();
  expect(await repo().acceptUpload(upload(media, "suspended"))).toEqual({ kind: "not_found" });
  expect(await jobsFor(media.mediaId)).toHaveLength(0);
});

test("[MER-14:db] adoption rejects content declaration or byte count mismatches", async () => {
  const media = await reserve(reserveRequest(await actor(400)));
  const original = upload(media, "initial");
  expect(await repo().acceptUpload({ ...original, contentType: "image/webp" })).toEqual({
    kind: "content_mismatch",
  });
  expect(await repo().acceptUpload({ ...original, bytes: 15 })).toEqual({
    kind: "content_mismatch",
  });
  expect(await repo().read(media)).toMatchObject({ status: "awaiting_upload" });
  expect(await jobsFor(media.mediaId)).toHaveLength(0);
});

test.each([
  { serial: 500, secondBytes: "photo", loser: "replayed" },
  { serial: 501, secondBytes: "different photo", loser: "upload_conflict" },
])(
  "[MER-14:db] concurrent adoption stores one key and job when the loser is $loser",
  async ({ serial, secondBytes, loser }) => {
    const media = await reserve(reserveRequest(await actor(serial)));
    const first = upload(media, "first");
    const second = upload(media, "second", secondBytes);
    const [left, right] = await concurrently(
      (repository) => repository.acceptUpload(first),
      (repository) => repository.acceptUpload(second),
    );
    expect([left.kind, right.kind].sort()).toEqual(["accepted", loser]);
    const winner = left.kind === "accepted" ? first : second;

    const { sql } = database.get();
    const [stored] = await sql`
    SELECT quarantine_key, content_digest = ${winner.digest} AS digest_matches
    FROM public.media_uploads WHERE id = ${media.mediaId}
  `;
    expect(stored).toEqual({ quarantine_key: winner.quarantineKey, digest_matches: true });
    expect(await repo().read(media)).toEqual({
      mediaId: media.mediaId,
      sessionId: media.sessionId,
      kind: "application",
      status: "preparing",
    });
    expect(await jobsFor(media.mediaId)).toEqual([
      {
        identifier: "media.process",
        queue_name: "media",
        key: `media:prepare:${media.mediaId}`,
        payload: { mediaId: media.mediaId, phase: "prepare" },
      },
    ]);
  },
);

test("[JOB-03:db] failed enqueue rolls back adoption and an exact retry can adopt", async () => {
  const media = await reserve(reserveRequest(await actor(600)));
  const request = upload(media, "retry");
  const { sql } = database.get();

  await sql`ALTER SCHEMA graphile_worker RENAME TO fixture_unavailable_worker`;
  try {
    await expect(repo().acceptUpload(request)).rejects.toMatchObject({ code: "3F000" });
    expect(await repo().read(media)).toMatchObject({ status: "awaiting_upload" });
    const [storage] = await sql`
      SELECT quarantine_key, content_digest FROM public.media_uploads WHERE id = ${media.mediaId}
    `;
    expect(storage).toEqual({ quarantine_key: null, content_digest: null });
  } finally {
    await sql`ALTER SCHEMA fixture_unavailable_worker RENAME TO graphile_worker`;
  }
  expect(await jobsFor(media.mediaId)).toHaveLength(0);
  expect(await repo().acceptUpload(request)).toMatchObject({ kind: "accepted" });
  expect(await jobsFor(media.mediaId)).toHaveLength(1);
});

test("[MER-14:db] a prepared preview is visible only to its authorized owner", async () => {
  const owner = await actor(700);
  const other = await actor(701);
  const merchantId = await restaurant(710);
  await membership(merchantId, owner.accountId, "manager");
  await membership(merchantId, other.accountId, "owner");
  const request = reserveRequest(owner, { ...png, kind: "cover", merchantId });
  const scope = await reserve(request);
  const { mediaId } = scope;
  const adoption = upload(scope, "preview-original");
  const { quarantineKey } = adoption;
  const repository = repo();
  expect(await repository.findPreparation(mediaId)).toBeUndefined();
  expect(await repository.findPreview(scope)).toBeUndefined();

  await repository.acceptUpload(adoption);
  expect(await repository.findPreparation(mediaId)).toEqual({
    status: "preparing",
    quarantineKey,
    ...png,
    digest: adoption.digest,
  });
  const previewKey = `previews/${mediaId}/candidate`;
  const result = { status: "awaiting_crop", previewKey, width: 1280, height: 960 } as const;
  expect(
    await repository.completePreparation({ mediaId, quarantineKey: "stale-key", result }),
  ).toBe(false);
  expect(await repository.completePreparation({ mediaId, quarantineKey, result })).toBe(true);
  expect(await repository.findPreparation(mediaId)).toBeUndefined();
  const status = {
    mediaId,
    sessionId: owner.sessionId,
    kind: "cover",
    status: "awaiting_crop",
    width: 1280,
    height: 960,
  };
  expect(await repository.read(scope)).toEqual(status);
  expect(await repository.findPreview(scope)).toEqual({ key: previewKey });
  expect(await repository.findPreview({ ...other, mediaId })).toBeUndefined();
  expect(await repository.findPreview({ ...scope, now: expiresAt })).toBeUndefined();
  expect(await repository.acceptUpload(upload(scope, "preview-replay"))).toEqual({
    kind: "replayed",
    media: status,
  });
  expect(await repository.reserve(request)).toEqual({
    kind: "replayed",
    media: { mediaId, sessionId: owner.sessionId, kind: "cover", status: "awaiting_upload" },
  });
  expect(await jobsFor(mediaId)).toHaveLength(1);

  const { sql } = database.get();
  await sql`UPDATE public.merchant_members SET role = 'staff' WHERE merchant_id = ${merchantId} AND user_id = ${owner.accountId}`;
  expect(await repository.findPreview(scope)).toBeUndefined();
});

test("[MER-14:db] concurrent rejections preserve the first result and allow original cleanup on retry", async () => {
  const scope = await reserve(reserveRequest(await actor(800)));
  const { mediaId } = scope;
  const adoption = upload(scope, "rejected-original");
  const { quarantineKey } = adoption;
  const repository = repo();
  await repository.acceptUpload(adoption);
  const [first, second] = await concurrently(
    (connection) =>
      connection.completePreparation({
        mediaId,
        quarantineKey,
        result: { status: "rejected", reason: "invalid_image" },
      }),
    (connection) =>
      connection.completePreparation({
        mediaId,
        quarantineKey,
        result: { status: "rejected", reason: "image_too_large" },
      }),
  );
  expect([first, second].sort()).toEqual([false, true]);
  const status = {
    mediaId,
    sessionId: scope.sessionId,
    kind: "application",
    status: "rejected",
    reason: first ? "invalid_image" : "image_too_large",
  };
  expect(await repository.read(scope)).toEqual(status);
  expect(await repository.findPreview(scope)).toBeUndefined();
  expect(await repository.findPreparation(mediaId)).toEqual({ status: "rejected", quarantineKey });
  expect(await repository.acceptUpload(upload(scope, "rejected-replay"))).toEqual({
    kind: "replayed",
    media: status,
  });
  expect(await repository.acceptUpload(upload(scope, "changed-body", "another"))).toEqual({
    kind: "upload_conflict",
  });
});

test("[MER-14:db] terminal preparation state requires complete valid metadata", async () => {
  const scope = await reserve(reserveRequest(await actor(900)));
  const { mediaId } = scope;
  const adoption = upload(scope, "invalid-preview");
  const repository = repo();
  await repository.acceptUpload(adoption);

  await expect(
    repository.completePreparation({
      mediaId,
      quarantineKey: adoption.quarantineKey,
      result: {
        status: "awaiting_crop",
        previewKey: `previews/${mediaId}/invalid`,
        width: 1281,
        height: 960,
      },
    }),
  ).rejects.toMatchObject({ code: "23514" });

  const { sql } = database.get();
  await expect(
    sql`UPDATE public.media_uploads SET status = 'rejected' WHERE id = ${mediaId}`,
  ).rejects.toMatchObject({ code: "23514" });
  expect(await repository.read(scope)).toMatchObject({ status: "preparing" });
});
