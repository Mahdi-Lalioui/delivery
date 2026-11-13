import { createHash } from "node:crypto";
import { openDatabase } from "../src/database.ts";
import { beforeAll, expect, test } from "vitest";
import { createMerchantRepository } from "../src/merchant.ts";
import { registerTestDatabase } from "./database.ts";

type Submission = Parameters<ReturnType<typeof createMerchantRepository>["submitApplication"]>[0];

const database = registerTestDatabase();
const now = new Date("2026-11-13T10:00:00.000Z");
const communeId = fixtureId(1);
let serial = 100;

function fixtureId(value: number): string {
  return `01932f18-3150-7c33-8a7b-${String(value).padStart(12, "0")}`;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

beforeAll(async () => {
  const { sql } = database.get();
  await sql`
    INSERT INTO wilayas (code, name_ar, name_fr)
    VALUES (16, 'ولاية تجريبية', 'Wilaya de test') ON CONFLICT (code) DO NOTHING
  `;
  await sql`
    INSERT INTO communes (id, code, wilaya_code, name_ar, name_fr, centroid, boundary)
    SELECT ${communeId}, '1697', 16, 'بلدية تجريبية', 'Commune de test',
      st_centroid(polygon)::geography, polygon
    FROM (SELECT st_multi(st_makeenvelope(3.04, 36.75, 3.06, 36.78, 4326)) AS polygon) shape
  `;
});

async function account() {
  serial += 1;
  const id = fixtureId(serial);
  await database.get().sql`
    INSERT INTO users (id, phone_e164, created_at)
    VALUES (${id}, ${`+2135${String(serial).padStart(8, "0")}`}, ${now.toISOString()})
  `;
  return id;
}

interface PhotoSeed {
  readonly owner: string;
  readonly kind?: "application" | "cover";
  readonly status?: "ready" | "processing";
}

async function insertPhoto({ owner, kind = "application", status = "ready" }: PhotoSeed) {
  serial += 1;
  const key = String(serial);
  const merchantId = kind === "application" ? null : await coverMerchant(owner);
  const thumbhash = status === "ready" ? "1QcSHQRnh493V4dIh4eXh1h4kJUI" : null;
  const [row] = await database.get().sql<{ id: string }[]>`
    INSERT INTO public.media_uploads (owner_id, merchant_id, kind, content_type, bytes, status,
      quarantine_key, content_digest, created_at, adopted_at, preview_key, preview_width,
      preview_height, crop_focal_x, crop_focal_y, crop_zoom_percent, thumbhash)
    VALUES (${owner}, ${merchantId}, ${kind}, 'image/png', 16, ${status}, ${`quarantine/${key}`},
      ${digest(key)}, ${now.toISOString()}, ${now.toISOString()}, ${`private/${key}/preview.webp`},
      1280, 720, 5000, 5000, 100, ${thumbhash})
    RETURNING id
  `;
  if (!row) throw new Error("Expected the fixture photo to be inserted");
  return row.id;
}

async function coverMerchant(owner: string) {
  const result = await createMerchantRepository(database.get()).submitApplication(
    submission(owner, []),
  );
  if (!("merchantId" in result)) throw new Error("Expected a fixture merchant");
  return result.merchantId;
}

function submission(accountId: string, photoIds: readonly string[]): Submission {
  serial += 1;
  const input = {
    restaurantName: `Restaurant fictif ${String(serial)}`,
    ownerName: "Propriétaire de test",
    communeId,
    pin: { latitude: 36.765, longitude: 3.05 },
    cuisines: ["algerian"],
    photoIds,
  };
  return {
    accountId,
    input,
    now,
    idempotencyKeyHash: digest(`application-photo-key-${String(serial)}`),
    requestHash: digest(JSON.stringify(input)),
  };
}

async function attachedPhotos(merchantId: string) {
  return database.get().sql<{ mediaId: string; position: number }[]>`
    SELECT media_id AS "mediaId", position FROM public.merchant_application_photos
    WHERE merchant_id = ${merchantId} ORDER BY position
  `;
}

test("[MER-01:db] signup attaches the applicant's ready application photos in order", async () => {
  const owner = await account();
  const first = await insertPhoto({ owner });
  const second = await insertPhoto({ owner });
  const repo = createMerchantRepository(database.get());

  const result = await repo.submitApplication(submission(owner, [second, first]));

  if (!("merchantId" in result)) throw new Error(`Expected creation, got ${result.kind}`);
  expect(await attachedPhotos(result.merchantId)).toEqual([
    { mediaId: second, position: 0 },
    { mediaId: first, position: 1 },
  ]);
});

test("[MER-01:db] signup refuses foreign, unready, non-application or reused photos", async () => {
  const owner = await account();
  const stranger = await account();
  const repo = createMerchantRepository(database.get());
  const used = await insertPhoto({ owner });
  const applied = await repo.submitApplication(submission(owner, [used]));
  expect(applied).toMatchObject({ kind: "created" });

  const refused = [
    await insertPhoto({ owner: stranger }),
    await insertPhoto({ owner, status: "processing" }),
    await insertPhoto({ owner, kind: "cover" }),
    fixtureId(999),
    used,
  ];
  for (const photoId of refused) {
    const before = await database.get().sql`SELECT id FROM public.merchants`;
    expect(await repo.submitApplication(submission(owner, [photoId]))).toEqual({
      kind: "photos_unavailable",
    });
    expect(await database.get().sql`SELECT id FROM public.merchants`).toHaveLength(before.length);
  }
});

test("[MER-01:db] two concurrent signups cannot share one application photo", async () => {
  const owner = await account();
  const photo = await insertPhoto({ owner });
  const other = openDatabase(database.url());
  try {
    for (let round = 0; round < 5; round += 1) {
      const shared = round === 0 ? photo : await insertPhoto({ owner });
      const results = await Promise.all([
        createMerchantRepository(database.get()).submitApplication(submission(owner, [shared])),
        createMerchantRepository(other).submitApplication(submission(owner, [shared])),
      ]);
      expect(results.map(({ kind }) => kind).sort()).toEqual(["created", "photos_unavailable"]);
    }
  } finally {
    await other.close();
  }
});
