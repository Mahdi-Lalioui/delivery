import type { TransactionSql } from "postgres";

const receiptTables = {
  otp: "otp_verification_receipts",
  admin: "admin_verification_receipts",
};

type Factor = keyof typeof receiptTables;

export interface VerificationAttempt {
  readonly keyHash: Uint8Array;
  readonly requestHash: Uint8Array;
}

export interface VerificationReceipt {
  readonly factor: Factor;
  readonly challengeId: string;
  readonly attempt: VerificationAttempt | undefined;
}

type RejectedAttempt = "invalid" | "locked";
type ReceiptOutcome = RejectedAttempt | "consumed";

export async function readVerificationReceipt(
  sql: TransactionSql,
  { factor, challengeId, attempt }: VerificationReceipt,
): Promise<{ readonly kind: ReceiptOutcome | "idempotency_conflict" } | undefined> {
  if (!attempt) return undefined;
  const { keyHash, requestHash } = attempt;
  const [receipt] = await sql<{ matches: boolean; outcome: ReceiptOutcome }[]>`
    SELECT request_hash = ${requestHash} AS matches, outcome
    FROM public.${sql(receiptTables[factor])}
    WHERE challenge_id = ${challengeId} AND key_hash = ${keyHash}
  `;
  if (!receipt) return undefined;
  return { kind: receipt.matches ? receipt.outcome : "idempotency_conflict" };
}

export async function writeVerificationReceipt(
  sql: TransactionSql,
  { factor, challengeId, attempt }: VerificationReceipt,
  outcome: RejectedAttempt | "verified",
): Promise<void> {
  if (!attempt) return;
  const { keyHash, requestHash } = attempt;
  // A successful response can contain a credential, so its replay always fails closed.
  const replay = outcome === "verified" ? "consumed" : outcome;
  await sql`
    INSERT INTO public.${sql(receiptTables[factor])} (challenge_id, key_hash, request_hash, outcome)
    VALUES (${challengeId}, ${keyHash}, ${requestHash}, ${replay})
  `;
}
