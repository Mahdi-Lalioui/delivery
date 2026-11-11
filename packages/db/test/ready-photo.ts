import type { Sql } from "postgres";
import type { MediaKind } from "../src/media-types.ts";

interface PhotoFixture {
  readonly mediaId: string;
  readonly accountId: string;
  readonly merchantId?: string;
  readonly kind: MediaKind;
  readonly now: Date;
}

export async function seedReadyPhoto(
  sql: Sql,
  { mediaId, accountId, merchantId, kind, now }: PhotoFixture,
) {
  const widths = [160, 320, 640, 960, 1280];
  const formats = ["avif", "webp"];
  const ratio = kind === "item" ? 3 / 4 : kind === "logo" ? 1 : 9 / 16;
  const variants = widths.flatMap((width) =>
    formats.map((format) => ({
      format,
      width,
      height: width * ratio,
      bytes: 16,
      key: `variants/${mediaId}/${String(width)}.${format}`,
    })),
  );
  await sql`
    insert into public.media_uploads
      (id, owner_id, merchant_id, kind, content_type, bytes, status, quarantine_key,
       content_digest, created_at, adopted_at, preview_key, preview_width, preview_height,
       reservation_session_id, crop_focal_x, crop_focal_y, crop_zoom_percent, ready_variants, thumbhash)
    values (${mediaId}, ${accountId}, ${merchantId ?? null}, ${kind}, 'image/png', 16, 'ready',
      ${`quarantine/${mediaId}`}, ${Buffer.alloc(32)}, ${now.toISOString()}, ${now.toISOString()},
      ${`previews/${mediaId}`}, 640, 480, uuidv7(), 5000, 5000, 100,
      ${JSON.stringify(variants)}::jsonb, 'GYiCAYYY2YA5CIgICA==')
  `;
}
