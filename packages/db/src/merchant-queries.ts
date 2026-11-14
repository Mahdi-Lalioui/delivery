import type { Sql, TransactionSql } from "postgres";
import { lockMerchantAdmin } from "./merchant-access.js";
import { timestampParsers } from "./timestamp-parsers.js";

interface CommunePage {
  readonly wilayaCode?: number | undefined;
  readonly cursor?: string | undefined;
  readonly limit: number;
}

interface Commune {
  readonly id: string;
  readonly code: string;
  readonly wilayaCode: number;
  readonly nameAr: string;
  readonly nameFr: string;
}

export async function listCommunes(sql: Sql, { wilayaCode, cursor, limit }: CommunePage) {
  const rows = await sql<Commune[]>`
    SELECT id, code, wilaya_code AS "wilayaCode", name_ar AS "nameAr", name_fr AS "nameFr"
    FROM public.communes
    WHERE (${wilayaCode ?? null}::smallint IS NULL OR wilaya_code = ${wilayaCode ?? null})
      AND code > ${cursor ?? ""}
    ORDER BY code LIMIT ${limit + 1}
  `;
  const communes = rows.slice(0, limit);
  return { communes, nextCursor: rows.length > limit ? (communes.at(-1)?.code ?? null) : null };
}

interface OnboardingScope {
  readonly accountId: string;
  readonly merchantId: string;
}

interface OnboardingProgress {
  readonly merchantId: string;
  readonly restaurantName: string;
  readonly hasHours: boolean;
  readonly itemsTowardMinimum: number;
}

export async function getOnboarding(
  sql: Sql,
  { accountId, merchantId }: OnboardingScope,
): Promise<OnboardingProgress | undefined> {
  const [progress] = await sql<OnboardingProgress[]>`
    SELECT merchant.id AS "merchantId", merchant.restaurant_name AS "restaurantName",
      EXISTS (
        SELECT FROM public.merchant_hours AS hours WHERE hours.merchant_id = merchant.id
      ) AS "hasHours",
      (
        SELECT count(*)::integer FROM (
          SELECT FROM public.items AS item
          WHERE item.merchant_id = merchant.id AND item.archived_at IS NULL
            AND item.moderation_status IN ('approved', 'unreviewed')
          LIMIT 5
        ) AS configured_items
      ) AS "itemsTowardMinimum"
    FROM public.merchants AS merchant
    JOIN public.merchant_members AS member ON member.merchant_id = merchant.id
    JOIN public.users AS account ON account.id = member.user_id
    WHERE merchant.id = ${merchantId} AND account.id = ${accountId}
      AND merchant.status IN ('approved', 'active', 'paused')
      AND member.role IN ('owner', 'manager')
      AND account.blocked_at IS NULL AND account.deleted_at IS NULL
  `;
  return progress;
}

interface QueuePage {
  readonly adminUserId: string;
  readonly cursor?: { submittedAt: string; merchantId: string } | undefined;
  readonly limit: number;
}

interface PendingApplication {
  readonly merchantId: string;
  readonly restaurantName: string;
  readonly ownerName: string;
  readonly phoneE164: string;
  readonly commune: Pick<Commune, "id" | "nameAr" | "nameFr">;
  readonly pin: { latitude: number; longitude: number };
  readonly cuisines: string[];
  readonly rcNumber: string | null;
  readonly submittedAt: Date;
}

export async function listPendingApplications(
  sql: TransactionSql,
  { adminUserId, cursor, limit }: QueuePage,
) {
  if (!(await lockMerchantAdmin(sql, adminUserId))) return undefined;
  const rows = await sql<PendingApplication[]>`
    SELECT merchant.id AS "merchantId", restaurant_name AS "restaurantName",
      owner_name AS "ownerName", phone_e164 AS "phoneE164", cuisines, rc_number AS "rcNumber",
      created_at AS "submittedAt",
      jsonb_build_object('id', commune.id, 'nameAr', commune.name_ar, 'nameFr', commune.name_fr) AS commune,
      jsonb_build_object('latitude', ST_Y(location::geometry), 'longitude', ST_X(location::geometry)) AS pin
    FROM public.merchants AS merchant JOIN public.communes AS commune ON commune.id = merchant.commune_id
    WHERE merchant.status = 'pending_review'
      AND (${cursor?.submittedAt ?? null}::timestamptz IS NULL
        OR (created_at, merchant.id) < (${cursor?.submittedAt ?? null}::timestamptz, ${cursor?.merchantId ?? null}::uuid))
    ORDER BY created_at DESC, merchant.id DESC LIMIT ${limit + 1}
  `.parsers(timestampParsers);
  const applications = rows.slice(0, limit).map((row) => ({
    ...row,
    submittedAt: row.submittedAt.toISOString(),
  }));
  const last = applications.at(-1);
  const nextCursor = rows.length > limit && last ? last.submittedAt + "~" + last.merchantId : null;
  return { applications, nextCursor };
}

interface ApplicationPhotoRequest {
  readonly adminUserId: string;
  readonly merchantId: string;
  readonly mediaId: string;
  readonly width: number;
}

/** An active admin reads one WebP variant of a photo attached to that merchant's application. */
export async function findApplicationPhotoVariant(
  sql: TransactionSql,
  { adminUserId, merchantId, mediaId, width }: ApplicationPhotoRequest,
) {
  if (!(await lockMerchantAdmin(sql, adminUserId))) return undefined;
  const [variant] = await sql<{ storageKey: string }[]>`
    SELECT variant.storage_key AS "storageKey"
    FROM public.merchant_application_photos AS photo
    JOIN public.media_uploads AS media ON media.id = photo.media_id
    JOIN public.media_variants AS variant ON variant.media_id = media.id
    WHERE photo.merchant_id = ${merchantId} AND photo.media_id = ${mediaId}
      AND media.kind = 'application' AND media.status = 'ready'
      AND variant.format = 'webp' AND variant.width = ${width}
  `;
  return variant;
}
