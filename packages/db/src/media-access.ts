import type { ISql, TransactionSql } from "postgres";
import type {
  MediaKind,
  MediaScope,
  MediaSessionScope,
  MediaState,
  MediaStatus,
  MediaUploadDescriptor,
} from "./media-types.js";

type VisibleMedia = MediaStatus & MediaUploadDescriptor & { readonly previewKey: string | null };

export function mediaStatus(
  media: MediaState & { readonly mediaId: string; readonly kind: MediaKind },
  sessionId: string,
): MediaStatus {
  const { mediaId, kind, status } = media;
  const identity = { mediaId, sessionId, kind };
  if (status === "awaiting_crop") {
    return { ...identity, status, width: media.width, height: media.height };
  }
  if (status === "rejected") return { ...identity, status, reason: media.reason };
  return { ...identity, status };
}

function standardSession(sql: ISql, { sessionId, now }: MediaSessionScope) {
  const at = now.toISOString();
  return sql`session.id = ${sessionId} AND session.kind = 'standard'
    AND session.revoked_at IS NULL AND session.created_at <= ${at} AND session.expires_at > ${at}`;
}

export async function lockMediaSession(sql: TransactionSql, scope: MediaSessionScope) {
  // Revocation and issuance also lock the account before its sessions.
  const [account] = await sql<{ id: string }[]>`
    SELECT id FROM public.users
    WHERE id = ${scope.accountId} AND blocked_at IS NULL AND deleted_at IS NULL
    FOR SHARE
  `;
  if (!account) return undefined;

  const [session] = await sql<{ id: string }[]>`
    SELECT session.id FROM public.sessions AS session
    WHERE session.user_id = ${account.id} AND ${standardSession(sql, scope)}
    FOR SHARE OF session
  `;
  return session && { accountId: account.id, sessionId: session.id };
}

export async function lockMediaTarget(
  sql: TransactionSql,
  accountId: string,
  merchantId: string | null,
): Promise<boolean> {
  if (merchantId === null) return true;

  const [merchant] = await sql`
    SELECT id FROM public.merchants
    WHERE id = ${merchantId} AND status IN ('approved', 'active', 'paused') AND EXISTS (
      SELECT FROM public.merchant_members
      WHERE merchant_id = ${merchantId} AND user_id = ${accountId} AND role IN ('owner', 'manager')
    )
    FOR SHARE
  `;
  if (!merchant) return false;

  const [member] = await sql`
    SELECT role FROM public.merchant_members
    WHERE merchant_id = ${merchantId} AND user_id = ${accountId} AND role IN ('owner', 'manager')
    FOR SHARE
  `;
  return member !== undefined;
}

export async function readVisibleMedia(
  sql: ISql,
  scope: MediaScope,
): Promise<VisibleMedia | undefined> {
  const [media] = await sql<VisibleMedia[]>`
    SELECT upload.id AS "mediaId", session.id AS "sessionId", upload.kind, upload.status,
      upload.content_type AS "contentType", upload.bytes, upload.preview_key AS "previewKey",
      upload.preview_width AS width, upload.preview_height AS height, upload.rejection_reason AS reason
    FROM public.media_uploads AS upload
    JOIN public.users AS account ON account.id = upload.owner_id
    JOIN public.sessions AS session ON session.user_id = account.id
    WHERE upload.id = ${scope.mediaId} AND account.id = ${scope.accountId}
      AND account.blocked_at IS NULL AND account.deleted_at IS NULL
      AND ${standardSession(sql, scope)}
      AND (upload.merchant_id IS NULL OR EXISTS (
        SELECT FROM public.merchant_members AS member
        JOIN public.merchants AS merchant ON merchant.id = member.merchant_id
        WHERE merchant.id = upload.merchant_id AND merchant.status IN ('approved', 'active', 'paused')
          AND member.user_id = account.id AND member.role IN ('owner', 'manager')
      ))
  `;
  return media;
}
