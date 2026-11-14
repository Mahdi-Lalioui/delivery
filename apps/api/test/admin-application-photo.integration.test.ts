import { createHash, randomUUIDv7 } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createLocalMediaStore } from "@zaafran/media";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = "2026-11-14T12:00:00.000Z";
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);
// startApi uses this default root when MEDIA_STORAGE_ROOT is not set.
const store = createLocalMediaStore({ root: join(tmpdir(), "zaafran-media") });

async function seedApplicationPhoto(ownerId: string, merchantId: string) {
  const mediaId = randomUUIDv7();
  const storageKey = `private/${mediaId}/640.webp`;
  const image = Buffer.from(`RIFF application photo ${mediaId}`);
  const { sql } = database.get();
  await sql`
    INSERT INTO public.media_uploads (id, owner_id, kind, content_type, bytes, status,
      quarantine_key, content_digest, created_at, adopted_at, preview_key, preview_width,
      preview_height, crop_focal_x, crop_focal_y, crop_zoom_percent, thumbhash)
    VALUES (${mediaId}, ${ownerId}, 'application', 'image/png', 16, 'ready',
      ${`quarantine/${mediaId}`}, ${createHash("sha256").update(mediaId).digest()}, ${now},
      ${now}, ${`private/${mediaId}/preview.webp`}, 1280, 720, 5000, 5000, 100,
      '1QcSHQRnh493V4dIh4eXh1h4kJUI')
  `;
  await sql`
    INSERT INTO public.media_variants (media_id, format, width, height, bytes, storage_key)
    VALUES (${mediaId}, 'webp', 640, 360, ${image.length}, ${storageKey})
  `;
  await sql`
    INSERT INTO public.merchant_application_photos (merchant_id, media_id, position)
    VALUES (${merchantId}, ${mediaId}, 0)
  `;
  await store.put({
    key: storageKey,
    body: Readable.from([image]),
    bytes: image.length,
    checksumSha256: createHash("sha256").update(image).digest("base64"),
  });
  return { mediaId, image };
}

test("[MER-01:http] only an admin sees a merchant's private application photo through startApi", async () => {
  const api = await openApi();
  const owner = await seedActor("+213500000071", "standard");
  const admin = await seedActor("+213500000072", "admin");
  const { owned, staffed } = await seedMenuMerchants(owner.userId);
  const { mediaId, image } = await seedApplicationPhoto(owner.userId, owned);
  const url = (merchantId: string) =>
    `/v1/admin/merchant-applications/${merchantId}/photos/${mediaId}/640`;

  const allowed = await api.inject({ url: url(owned), headers: admin.headers });
  expect(allowed.statusCode).toBe(200);
  expect(allowed.headers["content-type"]).toBe("image/webp");
  expect(allowed.headers["cache-control"]).toBe("no-store");
  expect(allowed.rawPayload).toEqual(image);

  expect((await api.inject({ url: url(owned), headers: owner.headers })).statusCode).toBe(403);
  expect((await api.inject({ url: url(staffed), headers: admin.headers })).statusCode).toBe(404);
  const published = await api.inject({ url: `/media/${mediaId}/640.webp` });
  expect(published.statusCode).toBe(404);
});
