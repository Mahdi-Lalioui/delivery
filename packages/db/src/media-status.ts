import type { ISql } from "postgres";
import type { MediaIdentity, MediaStatus, MediaVariant } from "./media-types.js";

interface StateRow {
  readonly status: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly thumbhash: string | null;
  readonly reason: "content_type_mismatch" | "invalid_image" | "image_too_large" | null;
  readonly variants: MediaVariant[];
}

function settledStatus(identity: MediaIdentity, row: StateRow): MediaStatus | undefined {
  const { status, thumbhash, reason, variants } = row;
  if (status === "ready" && thumbhash !== null) return { ...identity, status, variants, thumbhash };
  if (status === "rejected" && reason !== null) return { ...identity, status, reason };
  return undefined;
}

function toStatus(identity: MediaIdentity, row: StateRow): MediaStatus {
  const { status, width, height } = row;
  if (status === "awaiting_crop" && width !== null && height !== null) {
    return { ...identity, status, width, height };
  }
  if (status === "awaiting_upload" || status === "preparing" || status === "processing") {
    return { ...identity, status };
  }
  const settled = settledStatus(identity, row);
  if (!settled) throw new Error("The stored photo state is inconsistent");
  return settled;
}

/** Reads the photo's current state with the fields that state carries, in one statement. */
export async function describeMedia(
  sql: ISql,
  identity: MediaIdentity,
): Promise<MediaStatus | undefined> {
  const [row] = await sql<StateRow[]>`
    SELECT upload.status, upload.preview_width AS width, upload.preview_height AS height,
      upload.thumbhash, upload.rejection_reason AS reason,
      COALESCE((
        SELECT json_agg(json_build_object(
          'format', variant.format, 'width', variant.width,
          'height', variant.height, 'bytes', variant.bytes
        ) ORDER BY variant.format, variant.width)
        FROM public.media_variants AS variant WHERE variant.media_id = upload.id
      ), '[]'::json) AS variants
    FROM public.media_uploads AS upload
    WHERE upload.id = ${identity.mediaId}
  `;
  // A restaurant deletion can cascade between the command and this read.
  return row && toStatus(identity, row);
}
