import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { createMediaRepository } from "../src/media.ts";
import { createMerchantProfilePhotosRepository } from "../src/merchant-profile-photos.ts";
import { registerTestDatabase } from "./database.ts";
import { seedReadyPhoto } from "./ready-photo.ts";

const database = registerTestDatabase();
const now = new Date("2026-11-08T12:00:00.000Z");
const at = now.toISOString();
const id = (serial: number) => `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
const hash = (value: string) => createHash("sha256").update(value).digest();
const communeId = id(1);
const ownerId = id(2);
const managerId = id(3);
const staffId = id(4);
const outsideId = id(5);
const merchantId = id(10);
const otherMerchantId = id(11);
const restrictedMerchantId = id(12);
const restaurantName = "Restaurant fictif";
const coverPhotoId = id(20);
const logoPhotoId = id(21);
const unattachedCover = id(22);
const managerCover = id(23);
const foreignCover = id(24);
const localCover = id(25);
const localLogo = id(26);
const pendingCover = id(27);
const foreignOwnerLogo = id(28);
const repository = () => createMerchantProfilePhotosRepository(database.get());

beforeAll(async () => {
  const { sql } = database.get();
  await sql`INSERT INTO wilayas (code, name_ar, name_fr) VALUES (16, 'تجريبي', 'Test') ON CONFLICT DO NOTHING`;
  await sql`
    INSERT INTO communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    VALUES (${communeId}, '1699', 16, 'تجريبي', 'Test', ST_SetSRID(ST_MakePoint(3.05, 36.76), 4326))
  `;
  for (const [index, accountId] of [ownerId, managerId, staffId, outsideId].entries()) {
    await sql`INSERT INTO users (id, phone_e164, created_at)
      VALUES (${accountId}, ${"+21350000000" + String(index)}, ${at})`;
  }
  for (const targetId of [merchantId, otherMerchantId, restrictedMerchantId]) {
    await sql`
      INSERT INTO merchants (id, slug, restaurant_name, owner_name, phone_e164, commune_id,
        location, cuisines, status, created_at)
      VALUES (${targetId}, ${`fixture-${targetId}`}, ${restaurantName}, 'Propriétaire fictif', '+213500000000',
        ${communeId}, ST_SetSRID(ST_MakePoint(3.05, 36.76), 4326), ARRAY['algerian'], 'approved', ${at})
    `;
    await sql`
      INSERT INTO merchant_members (merchant_id, user_id, role)
      VALUES (${targetId}, ${ownerId}, 'owner'), (${targetId}, ${managerId}, 'manager'),
        (${targetId}, ${staffId}, 'staff')
    `;
  }
  for (const [mediaId, kind, targetId, accountId] of [
    [coverPhotoId, "cover", merchantId, ownerId],
    [logoPhotoId, "logo", merchantId, ownerId],
    [unattachedCover, "cover", merchantId, ownerId],
    [managerCover, "cover", merchantId, managerId],
    [foreignCover, "cover", otherMerchantId, ownerId],
    [localCover, "cover", restrictedMerchantId, ownerId],
    [localLogo, "logo", restrictedMerchantId, ownerId],
    [foreignOwnerLogo, "logo", restrictedMerchantId, managerId],
  ] as const) {
    await seedReadyPhoto(sql, { mediaId, accountId, merchantId: targetId, kind, now });
  }
  await sql`
    INSERT INTO media_uploads (id, owner_id, merchant_id, kind, content_type, bytes, created_at)
    VALUES (${pendingCover}, ${ownerId}, ${restrictedMerchantId}, 'cover', 'image/png', 16, ${at})
  `;
});

const noPhotos = { coverPhotoId: null, logoPhotoId: null };
const savedPhotos = { coverPhotoId, logoPhotoId };

function command(
  scope: { accountId: string; merchantId: string },
  key: string,
  input: { expectedRevision: number; coverPhotoId: string | null; logoPhotoId: string | null },
) {
  return {
    ...scope,
    now,
    input,
    idempotencyKeyHash: hash(key),
    requestHash: hash(JSON.stringify(input)),
  };
}

async function session(accountId: string, serial: number) {
  const sessionId = id(serial);
  await database.get().sql`
    INSERT INTO sessions
      (id, user_id, token_hash, transport, kind, request_ip, created_at, last_seen_at, expires_at)
    VALUES (${sessionId}, ${accountId}, ${hash(sessionId)}, 'web', 'standard', '192.0.2.1',
      ${at}, ${at}, ${at}::timestamptz + interval '1 hour')
  `;
  return { accountId, sessionId, now };
}

test("[MER-14:db] shared profile photos retain scope, replacement, removal and command replay", async () => {
  const repo = repository();
  const media = createMediaRepository(database.get());
  const owner = { accountId: ownerId, merchantId };
  const manager = { accountId: managerId, merchantId };
  const managerSession = await session(managerId, 30);
  const staffSession = await session(staffId, 31);
  const variant = { format: "webp", width: 160 } as const;
  const cover = { ...managerSession, mediaId: coverPhotoId };
  const logo = { ...managerSession, mediaId: logoPhotoId };
  const hidden = { ...managerSession, mediaId: unattachedCover };
  const initial = command(owner, "attach", { ...savedPhotos, expectedRevision: 0 });

  await expect(repo.read(owner)).resolves.toEqual({ ...noPhotos, restaurantName, revision: 0 });
  await expect(media.read(cover)).resolves.toBeUndefined();
  const attached = { ...savedPhotos, restaurantName, revision: 1 };
  await expect(repo.write(initial)).resolves.toEqual({ kind: "applied", ...attached });
  await expect(repo.read(manager)).resolves.toEqual(attached);
  await expect(media.read(cover)).resolves.toMatchObject({ status: "ready", kind: "cover" });
  await expect(media.read(logo)).resolves.toMatchObject({ status: "ready", kind: "logo" });
  for (const scope of [cover, logo]) {
    await expect(media.findVariant({ ...scope, ...variant })).resolves.toEqual({
      key: `variants/${scope.mediaId}/160.webp`,
    });
    await expect(media.findUpload(scope)).resolves.toBeUndefined();
    await expect(media.findPreview(scope)).resolves.toBeUndefined();
  }
  await expect(media.read(hidden)).resolves.toBeUndefined();
  await expect(
    media.findVariant({ ...staffSession, mediaId: coverPhotoId, ...variant }),
  ).resolves.toBeUndefined();
  await expect(
    media.submitCrop({
      ...cover,
      input: { focalX: 5000, focalY: 5000, zoomPercent: 100 },
      idempotencyKeyHash: hash("other-crop"),
      requestHash: hash("other-crop"),
    }),
  ).resolves.toEqual({ kind: "not_found" });

  const changed = { coverPhotoId: managerCover, logoPhotoId, expectedRevision: 1 };
  await expect(repo.write(command(manager, "replace", changed))).resolves.toMatchObject({
    kind: "applied",
    revision: 2,
    coverPhotoId: managerCover,
    logoPhotoId,
  });
  await expect(media.findVariant({ ...cover, ...variant })).resolves.toBeUndefined();
  await expect(repo.write(command(manager, "stale", changed))).resolves.toEqual({
    kind: "revision_conflict",
  });
  await expect(
    repo.write(command(manager, "clear", { ...noPhotos, expectedRevision: 2 })),
  ).resolves.toEqual({ kind: "applied", ...noPhotos, restaurantName, revision: 3 });
  await expect(media.read(logo)).resolves.toBeUndefined();
  await expect(repo.write(initial)).resolves.toEqual({ kind: "replayed", ...attached });
  await expect(
    repo.write(command(owner, "attach", { ...noPhotos, expectedRevision: 0 })),
  ).resolves.toEqual({ kind: "idempotency_conflict" });
  await expect(repo.read(owner)).resolves.toEqual({ ...noPhotos, restaurantName, revision: 3 });
});

test("[MER-14:db] new profile attachments require the correct ready kind, uploader and restaurant", async () => {
  const repo = repository();
  const owner = { accountId: ownerId, merchantId: restrictedMerchantId };
  for (const photos of [
    { coverPhotoId: foreignCover, logoPhotoId: localLogo },
    { coverPhotoId: localLogo, logoPhotoId: null },
    { coverPhotoId: null, logoPhotoId: localCover },
    { coverPhotoId: pendingCover, logoPhotoId: localLogo },
    { coverPhotoId: localCover, logoPhotoId: foreignOwnerLogo },
  ]) {
    await expect(
      repo.write(command(owner, "eligible", { ...photos, expectedRevision: 0 })),
    ).resolves.toEqual({ kind: "photos_unavailable" });
  }
  await expect(repo.read(owner)).resolves.toEqual({ ...noPhotos, restaurantName, revision: 0 });
  const valid = { coverPhotoId: localCover, logoPhotoId: localLogo, expectedRevision: 0 };
  for (const accountId of [staffId, outsideId]) {
    const scope = { ...owner, accountId };
    await expect(repo.read(scope)).resolves.toBeUndefined();
    await expect(repo.write(command(scope, "eligible", valid))).resolves.toEqual({
      kind: "not_found",
    });
  }
  await expect(repo.write(command(owner, "eligible", valid))).resolves.toMatchObject({
    kind: "applied",
    revision: 1,
    coverPhotoId: localCover,
    logoPhotoId: localLogo,
  });
  await expect(database.get().sql`
    UPDATE merchants SET cover_photo_id = ${foreignCover} WHERE id = ${restrictedMerchantId}
  `).rejects.toMatchObject({ code: "23503" });
});
