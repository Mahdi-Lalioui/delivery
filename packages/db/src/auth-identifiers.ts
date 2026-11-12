import type { ISql, TransactionSql } from "postgres";
import {
  redeemOtp,
  reserveOtpChallenge,
  type OtpBinding,
  type OtpReservation,
  type OtpVerification,
} from "./auth-otp.js";
import { lockOtpIdentifier } from "./auth-otp-lock.js";
import type { AuthIdentifier } from "./auth-types.js";

type IdentifierScope = OtpBinding & { readonly now: Date };
type VerifiedIdentifiers = { sessionId: string; phone: string | null; email: string | null };

export async function readVerifiedIdentifiers(
  sql: ISql,
  { userId, sessionId, now }: IdentifierScope,
  lock = false,
): Promise<VerifiedIdentifiers | undefined> {
  const [account] = await sql<VerifiedIdentifiers[]>`
    SELECT session.id AS "sessionId", account.phone_e164 AS phone, account.email
    FROM public.users AS account
    JOIN public.sessions AS session ON session.user_id = account.id
    WHERE account.id = ${userId} AND account.blocked_at IS NULL AND account.deleted_at IS NULL
      AND session.id = ${sessionId} AND session.revoked_at IS NULL
      AND session.created_at <= ${now.toISOString()} AND session.expires_at > ${now.toISOString()}
      AND (session.kind = 'admin' OR NOT EXISTS (SELECT FROM public.admins WHERE user_id = account.id))
    ${lock ? sql`FOR UPDATE OF account` : sql``}
  `;
  return account;
}

export async function reserveIdentifierChange(
  sql: TransactionSql,
  input: AuthIdentifier & Omit<OtpReservation, "phoneE164" | "email" | "purpose">,
  scope: IdentifierScope,
) {
  await lockOtpIdentifier(sql, input.email ?? input.phoneE164);
  if (!(await readVerifiedIdentifiers(sql, scope, true))) return { kind: "unauthorized" } as const;
  return reserveOtpChallenge(sql, { ...input, purpose: "identifier_change" }, scope);
}

export async function confirmIdentifierChange(
  sql: TransactionSql,
  input: IdentifierScope & OtpVerification,
) {
  const { userId, sessionId, challengeId } = input;
  const [pending] = await sql<{ target: string }[]>`
    SELECT coalesce(email, phone_e164) AS target FROM public.otp_challenges
    WHERE id = ${challengeId} AND binding_user_id = ${userId} AND binding_session_id = ${sessionId}
  `;
  if (!pending) return { kind: "invalid" } as const;
  const previous = await readVerifiedIdentifiers(sql, input);
  if (!previous) return { kind: "unauthorized" } as const;
  const locks = new Set(
    [pending.target, previous.phone, previous.email].filter((value) => value !== null),
  );
  for (const identifier of [...locks].sort()) await lockOtpIdentifier(sql, identifier);
  const account = await readVerifiedIdentifiers(sql, input, true);
  if (!account) return { kind: "unauthorized" } as const;
  if (account.phone !== previous.phone || account.email !== previous.email) {
    return { kind: "identifier_changed" } as const;
  }
  const verified = await redeemOtp(sql, input, input);
  if (verified.kind !== "verified") return verified;

  const updated = await adoptIdentifier(sql, { ...input, account }, verified);
  return updated
    ? ({ kind: "updated", ...updated } as const)
    : ({ kind: "identifier_unavailable" } as const);
}

async function adoptIdentifier(
  sql: TransactionSql,
  { userId, now, account }: IdentifierScope & { account: VerifiedIdentifiers },
  verified: AuthIdentifier,
): Promise<VerifiedIdentifiers | undefined> {
  const emailChange = verified.email !== undefined;
  const [other] = await sql`
    SELECT FROM public.users WHERE id <> ${userId}
      AND ${emailChange ? sql`email = ${verified.email}` : sql`phone_e164 = ${verified.phoneE164}`}
  `;
  if (other) return undefined;
  const original = emailChange ? account.email : account.phone;
  const target = verified.email ?? verified.phoneE164;
  if (original !== target) {
    await sql`
      UPDATE public.users SET ${emailChange ? sql`email = ${verified.email}` : sql`phone_e164 = ${verified.phoneE164}`}
      WHERE id = ${userId}
    `;
    await sql`
      UPDATE public.otp_challenges SET consumed_at = ${now.toISOString()}
      WHERE consumed_at IS NULL AND expires_at > ${now.toISOString()} AND binding_user_id IS NULL
        AND ${
          emailChange
            ? sql`(email = ${original} OR email = ${target})`
            : sql`(phone_e164 = ${original} OR phone_e164 = ${target})`
        }
    `;
    await sql`
      UPDATE public.account_deletion_challenges SET code_hmac = NULL, key_hash = NULL
      WHERE user_id = ${userId} AND expires_at > ${now.toISOString()}
    `;
  }
  return emailChange
    ? { ...account, email: verified.email }
    : { ...account, phone: verified.phoneE164 };
}
