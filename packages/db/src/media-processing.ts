import type { TransactionSql } from "postgres";
import type { DatabaseConnection } from "./database.js";
import type { MediaKind, MediaUploadDescriptor } from "./media-types.js";

const formats = ["avif", "webp"] as const;
const widths = [160, 320, 640, 960, 1280] as const;
const writeIsolation = "isolation level read committed";

export type ProcessingStatus = "preparing" | "awaiting_crop" | "processing" | "ready" | "rejected";
export type RejectionReason = "content_type_mismatch" | "invalid_image" | "image_too_large";

export interface ProcessingUpload {
  readonly mediaId: string;
  readonly kind: MediaKind;
  readonly contentType: MediaUploadDescriptor["contentType"];
  readonly status: ProcessingStatus;
  readonly quarantineKey: string;
  readonly crop: {
    readonly focalX: number;
    readonly focalY: number;
    readonly zoomPercent: number;
  } | null;
}

export interface PublishedVariant {
  readonly format: (typeof formats)[number];
  readonly width: (typeof widths)[number];
  readonly height: number;
  readonly bytes: number;
  readonly storageKey: string;
}

interface PreviewInput {
  readonly mediaId: string;
  readonly previewKey: string;
  readonly width: number;
  readonly height: number;
}

interface PublishInput {
  readonly mediaId: string;
  readonly thumbhash: string;
  readonly variants: readonly PublishedVariant[];
}

/** One variant per format and width, so the publication is never partial. */
function isCompleteSet(variants: readonly PublishedVariant[]): boolean {
  const entries = new Set(variants.map(({ format, width }) => `${format}:${width.toString()}`));
  return variants.length === formats.length * widths.length && entries.size === variants.length;
}

async function lockStatus(sql: TransactionSql, mediaId: string) {
  const [row] = await sql<{ status: string }[]>`
    SELECT status FROM public.media_uploads WHERE id = ${mediaId} FOR UPDATE
  `;
  return row?.status;
}

async function publish(sql: TransactionSql, { mediaId, thumbhash, variants }: PublishInput) {
  if ((await lockStatus(sql, mediaId)) !== "processing") return "stale" as const;
  await sql`
    INSERT INTO public.media_variants (media_id, format, width, height, bytes, storage_key)
    SELECT ${mediaId}, format, width, height, bytes, storage_key
    FROM unnest(${variants.map((variant) => variant.format)}::text[],
      ${variants.map((variant) => variant.width)}::int[],
      ${variants.map((variant) => variant.height)}::int[],
      ${variants.map((variant) => variant.bytes)}::int[],
      ${variants.map((variant) => variant.storageKey)}::text[])
      AS variant(format, width, height, bytes, storage_key)
  `;
  await sql`
    UPDATE public.media_uploads SET status = 'ready', thumbhash = ${thumbhash}
    WHERE id = ${mediaId}
  `;
  return "published" as const;
}

/** Worker-side state changes. Each applies only from its expected state, so retries are no-ops. */
export function createMediaProcessingRepository({ sql }: DatabaseConnection) {
  return {
    read: async (mediaId: string): Promise<ProcessingUpload | undefined> => {
      const [row] = await sql<ProcessingUpload[]>`
        SELECT id AS "mediaId", kind, content_type AS "contentType", status,
          quarantine_key AS "quarantineKey",
          CASE WHEN crop_zoom_percent IS NULL THEN NULL ELSE json_build_object(
            'focalX', crop_focal_x, 'focalY', crop_focal_y, 'zoomPercent', crop_zoom_percent
          ) END AS crop
        FROM public.media_uploads
        WHERE id = ${mediaId} AND status <> 'awaiting_upload'
      `;
      return row;
    },
    recordPreview: async ({ mediaId, previewKey, width, height }: PreviewInput) => {
      const rows = await sql`
        UPDATE public.media_uploads
        SET status = 'awaiting_crop', preview_key = ${previewKey},
          preview_width = ${width}, preview_height = ${height}
        WHERE id = ${mediaId} AND status = 'preparing'
        RETURNING id
      `;
      return rows.length === 1 ? ("recorded" as const) : ("stale" as const);
    },
    reject: async ({ mediaId, reason }: { mediaId: string; reason: RejectionReason }) => {
      const rows = await sql`
        UPDATE public.media_uploads SET status = 'rejected', rejection_reason = ${reason}
        WHERE id = ${mediaId} AND status IN ('preparing', 'processing')
        RETURNING id
      `;
      return rows.length === 1 ? ("rejected" as const) : ("stale" as const);
    },
    publish: async (input: PublishInput) => {
      if (!isCompleteSet(input.variants)) return "incomplete" as const;
      return sql.begin(writeIsolation, (tx) => publish(tx, input));
    },
  };
}
