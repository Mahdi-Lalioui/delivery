import type { ISql, TransactionSql } from "postgres";
import { authTimestampParsers } from "./auth-sql.js";
import type {
  AuthTransport,
  AuthUser,
  DeviceSession,
  ResolvedSession,
  SessionKind,
} from "./auth-types.js";

const hourMs = 3_600_000;
const adminLifetimeMs = 12 * hourMs;
const standardIdleMs = 30 * 24 * hourMs;

interface UserSignIn {
  readonly phoneE164: string;
  readonly now: Date;
}

interface SessionInsertion {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: Uint8Array;
  readonly transport: AuthTransport;
  readonly kind: SessionKind;
  readonly deviceName: string | null;
  readonly requestIp: string;
  readonly now: Date;
}

interface SessionResolution {
  readonly tokenHash: Uint8Array;
  readonly transport: AuthTransport;
  readonly now: Date;
}

interface SessionList {
  readonly userId: string;
  readonly now: Date;
}

interface SessionRevocation extends SessionList {
  readonly scope: { readonly kind: "one"; readonly sessionId: string } | { readonly kind: "all" };
}

export async function lockUserByPhone(
  sql: TransactionSql,
  phoneE164: string,
): Promise<AuthUser | undefined> {
  const [user] = await sql<AuthUser[]>`
    SELECT id, phone_e164 AS "phoneE164", blocked_at AS "blockedAt", deleted_at AS "deletedAt"
    FROM public.users WHERE phone_e164 = ${phoneE164}
    FOR UPDATE
  `.parsers(authTimestampParsers);
  return user;
}

export async function getOrCreateUserForSignIn(
  sql: TransactionSql,
  { phoneE164, now }: UserSignIn,
): Promise<AuthUser> {
  await sql`
    INSERT INTO public.users (phone_e164, created_at) VALUES (${phoneE164}, ${now.toISOString()})
    ON CONFLICT (phone_e164) DO NOTHING
  `;
  const user = await lockUserByPhone(sql, phoneE164);
  if (!user) throw new Error("Could not lock the authentication account.");
  return user;
}

export async function insertSession(
  sql: TransactionSql,
  input: SessionInsertion,
): Promise<DeviceSession> {
  const { id, userId, tokenHash, transport, kind, deviceName, requestIp, now } = input;
  const [user] = await sql<{ id: string }[]>`
    SELECT id FROM public.users
    WHERE id = ${userId} AND blocked_at IS NULL AND deleted_at IS NULL
    FOR UPDATE
  `;
  if (!user) throw new Error("Could not issue a session for an inactive account.");

  const expiresAt = new Date(now.getTime() + (kind === "admin" ? adminLifetimeMs : standardIdleMs));
  const [session] = await sql<DeviceSession[]>`
    INSERT INTO public.sessions
      (id, user_id, token_hash, transport, kind, device_name, request_ip, created_at, last_seen_at, expires_at)
    SELECT ${id}::uuid, ${userId}::uuid, ${tokenHash}::bytea, ${transport}, ${kind}, ${deviceName},
      ${requestIp}::inet, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz, ${expiresAt.toISOString()}::timestamptz
    WHERE ${kind} = 'standard' OR EXISTS (SELECT FROM public.admins WHERE user_id = ${userId})
    RETURNING id, created_at AS "createdAt", last_seen_at AS "lastSeenAt", expires_at AS "expiresAt",
      device_name AS "deviceName"
  `.parsers(authTimestampParsers);
  if (!session) throw new Error("Could not issue a session for an unenrolled administrator.");
  return session;
}

export async function resolveSession(
  sql: ISql,
  { tokenHash, transport, now }: SessionResolution,
): Promise<ResolvedSession | undefined> {
  const standardDeadline = new Date(now.getTime() + standardIdleMs);
  const [session] = await sql<ResolvedSession[]>`
    UPDATE public.sessions AS session
    SET last_seen_at = greatest(session.last_seen_at, ${now.toISOString()}::timestamptz),
      expires_at = CASE WHEN session.kind = 'standard'
        THEN greatest(session.expires_at, ${standardDeadline.toISOString()}::timestamptz)
        ELSE session.expires_at
      END
    FROM public.users AS account
    WHERE session.user_id = account.id AND session.token_hash = ${tokenHash}
      AND session.transport = ${transport} AND session.revoked_at IS NULL
      AND session.created_at <= ${now.toISOString()} AND session.expires_at > ${now.toISOString()}
      AND account.blocked_at IS NULL AND account.deleted_at IS NULL
      AND (session.kind = 'standard' OR EXISTS (SELECT FROM public.admins WHERE user_id = account.id))
    RETURNING session.id, session.user_id AS "userId", session.transport, session.kind,
      session.created_at AS "createdAt", session.last_seen_at AS "lastSeenAt",
      session.expires_at AS "expiresAt", session.device_name AS "deviceName"
  `.parsers(authTimestampParsers);
  return session;
}

export async function listSessions(
  sql: ISql,
  { userId, now }: SessionList,
): Promise<DeviceSession[]> {
  return sql<DeviceSession[]>`
    SELECT session.id, session.created_at AS "createdAt", session.last_seen_at AS "lastSeenAt",
      session.expires_at AS "expiresAt", session.device_name AS "deviceName"
    FROM public.sessions AS session
    JOIN public.users AS account ON account.id = session.user_id
    WHERE session.user_id = ${userId} AND session.revoked_at IS NULL AND session.expires_at > ${now.toISOString()}
      AND account.blocked_at IS NULL AND account.deleted_at IS NULL
      AND (session.kind = 'standard' OR EXISTS (SELECT FROM public.admins WHERE user_id = account.id))
    ORDER BY session.last_seen_at DESC, session.id DESC
  `.parsers(authTimestampParsers);
}

export async function revokeSessions(
  sql: TransactionSql,
  { userId, scope, now }: SessionRevocation,
): Promise<number> {
  // Serialize account-wide revocation against all session issuance.
  const [user] = await sql<{ id: string }[]>`
    SELECT id FROM public.users WHERE id = ${userId} FOR UPDATE
  `;
  if (!user) return 0;

  const scopeFilter = scope.kind === "one" ? sql`AND id = ${scope.sessionId}` : sql``;
  const result = await sql`
    UPDATE public.sessions SET revoked_at = ${now.toISOString()}
    WHERE user_id = ${userId} AND revoked_at IS NULL AND expires_at > ${now.toISOString()} ${scopeFilter}
  `;
  return result.count;
}
