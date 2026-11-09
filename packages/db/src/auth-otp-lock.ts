import type { TransactionSql } from "postgres";

export async function lockOtpPhone(sql: TransactionSql, phoneE164: string): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(63840, hashtext(${phoneE164}))`;
}

export async function normalizeOtpIp(sql: TransactionSql, requestIp: string): Promise<string> {
  const [address] = await sql<{ ip: string }[]>`
    SELECT host(
      CASE WHEN ${requestIp}::inet <<= '::ffff:0:0/96'::inet
        THEN '0.0.0.0'::inet + (${requestIp}::inet - '::ffff:0:0/96'::inet)
        ELSE ${requestIp}::inet
      END
    ) AS ip
  `;
  if (!address) throw new Error("Could not resolve the OTP source address.");
  return address.ip;
}
