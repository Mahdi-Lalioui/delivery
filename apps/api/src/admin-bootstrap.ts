import { randomBytes } from "node:crypto";
import { normalizedEmail } from "@zaafran/contracts/auth";
import type { DatabaseConnection } from "@zaafran/db/database";
import { sealTotpSecret } from "./auth-totp.js";

export function bootstrapAdmin(
  database: DatabaseConnection,
  { email, operator, force, key }: { email: string; operator: string; force: boolean; key: Buffer },
) {
  const address = normalizedEmail.parse(email);
  if (!/^[a-zA-Z0-9_.@-]{1,80}$/.test(operator)) throw new Error("Invalid operator label.");
  if (key.length !== 32) throw new Error("Invalid encryption key.");

  return database.sql.begin(async (sql) => {
    await sql`SELECT pg_advisory_xact_lock(125973293, 67)`;
    const [account] = await sql<{ id: string }[]>`
      SELECT id FROM public.users
      WHERE email = ${address} AND blocked_at IS NULL AND deleted_at IS NULL
      FOR UPDATE
    `;
    if (!account) return { kind: "no_account" } as const;
    const admins = await sql<{ user_id: string }[]>`
      SELECT user_id FROM public.admins ORDER BY (user_id = ${account.id}) DESC LIMIT 1
    `;
    if (admins[0]?.user_id === account.id) return { kind: "already_admin" } as const;
    if (admins.length > 0 && !force) return { kind: "admin_exists" } as const;

    const secret = randomBytes(20);
    const sealed = sealTotpSecret({ key, userId: account.id, secret });
    await sql`INSERT INTO public.admins (user_id, totp_secret_encrypted) VALUES (${account.id}, ${sealed})`;
    await sql`UPDATE public.sessions SET revoked_at = transaction_timestamp()
      WHERE user_id = ${account.id} AND revoked_at IS NULL`;
    await sql`INSERT INTO public.admin_bootstrap_audit (user_id, operator, forced)
      VALUES (${account.id}, ${operator}, ${force})`;
    return { kind: "created", userId: account.id, secret } as const;
  });
}
