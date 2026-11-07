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
