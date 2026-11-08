import { createHash, randomUUIDv7 } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import type { DatabaseConnection } from "@zaafran/db/database";
import { createLocalMediaStore, cropPhoto } from "@zaafran/media";
import type { AlgiersCommune } from "./e2e-auth-types.ts";

async function publishCover(root: string, mediaId: string) {
  const source = await readFile(
    new URL("../../../packages/db/fixtures/demo-menu/grill.png", import.meta.url),
  );
  const cropped = await cropPhoto({
    bytes: source,
    contentType: "image/png",
    kind: "cover",
    crop: { focalX: 5000, focalY: 5000, zoomPercent: 100 },
  });
  if (cropped.status !== "cropped") throw new Error("Could not crop the discovery fixture.");
  const store = createLocalMediaStore({ root });
  const variants = await Promise.all(
    cropped.variants.map(async ({ format, width, height, bytes }) => {
      const key = `e2e-feed/${mediaId}/${String(width)}.${format}`;
      await store.put({
        key,
        body: Readable.from(bytes),
        bytes: bytes.length,
        checksumSha256: createHash("sha256").update(bytes).digest("base64"),
      });
      return { key, format, width, height, bytes: bytes.length };
    }),
  );
  return { source, variants, thumbhash: cropped.thumbhash };
}

export async function seedDiscoveryFeed(
  { sql }: DatabaseConnection,
  { root, commune, now }: { root: string; commune: AlgiersCommune; now: Date },
) {
  const names = {
    publishedName: "Table du Safran · مائدة الزعفران",
    hiddenName: "Cuisine en préparation · مطبخ قيد التحضير",
  };
  const merchantId = randomUUIDv7();
  const mediaId = randomUUIDv7();
  const ownerId = randomUUIDv7();
  const { source, variants, thumbhash } = await publishCover(root, mediaId);
  const at = now.toISOString();

  await sql.begin(async (tx) => {
    await tx`INSERT INTO public.users (id, phone_e164, created_at)
      VALUES (${ownerId}, '+213500000000', ${at})`;
    await tx`INSERT INTO public.merchants
      (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines,
       status, created_at, reviewed_at)
      VALUES
      (${merchantId}, 'fixture-table-safran', ${names.publishedName}, 'Synthetic owner', '+213500000000',
       ${commune.id}, ST_SetSRID(ST_MakePoint(${commune.pin.longitude}, ${commune.pin.latitude}), 4326),
       ARRAY['algerian'], 'active', ${at}, ${at}),
      (uuidv7(), 'fixture-four-matin', 'Four du Matin · فرن الصباح', 'Synthetic owner', '+213500000000',
       ${commune.id}, ST_SetSRID(ST_MakePoint(${commune.pin.longitude}, ${commune.pin.latitude}), 4326),
       ARRAY['bakery'], 'active', ${at}, ${at}),
      (uuidv7(), 'fixture-cour-citron', 'Cour du Citron · ساحة الليمون', 'Synthetic owner', '+213500000000',
       ${commune.id}, ST_SetSRID(ST_MakePoint(${commune.pin.longitude}, ${commune.pin.latitude}), 4326),
       ARRAY['grill'], 'active', ${at}, ${at}),
      (uuidv7(), 'fixture-cuisine-preparation', ${names.hiddenName}, 'Synthetic owner', '+213500000000',
       ${commune.id}, ST_SetSRID(ST_MakePoint(${commune.pin.longitude}, ${commune.pin.latitude}), 4326),
       ARRAY['algerian'], 'pending_review', ${at}, null)`;
    await tx`INSERT INTO public.media_uploads
      (id, owner_id, merchant_id, kind, content_type, bytes, status, quarantine_key,
       content_digest, created_at, adopted_at, preview_key, preview_width, preview_height,
       reservation_session_id, crop_focal_x, crop_focal_y, crop_zoom_percent, ready_variants, thumbhash)
      VALUES (${mediaId}, ${ownerId}, ${merchantId}, 'cover', 'image/png', ${source.length}, 'ready',
       ${"e2e-source/" + mediaId}, ${createHash("sha256").update(source).digest()}, ${at}, ${at},
       ${"e2e-preview/" + mediaId}, 640, 480, uuidv7(), 5000, 5000, 100,
       ${JSON.stringify(variants)}::jsonb, ${thumbhash})`;
    await tx`UPDATE public.merchants SET cover_photo_id = ${mediaId} WHERE id = ${merchantId}`;
    await tx`INSERT INTO public.merchant_hours (merchant_id, weekday, opens_minute, closes_minute)
      SELECT ${merchantId}, weekday, 0, 1440 FROM generate_series(0, 6) AS weekday`;
  });
  return names;
}
