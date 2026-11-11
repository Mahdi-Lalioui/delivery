import type { pushSubscriptionInput } from "@zaafran/contracts/push";
import type { TransactionSql } from "postgres";
import type { DatabaseConnection } from "./database.js";

type Scope = { userId: string; sessionId: string };
type Subscription = ReturnType<typeof pushSubscriptionInput.parse>;
const maximumDevices = 10;

async function lockActiveSession(sql: TransactionSql, { userId, sessionId }: Scope) {
  const [account] = await sql`
    SELECT FROM public.users WHERE id = ${userId} AND deleted_at IS NULL AND blocked_at IS NULL
    FOR UPDATE
  `;
  if (!account) return false;
  const [session] = await sql`
    SELECT FROM public.sessions WHERE id = ${sessionId} AND user_id = ${userId}
      AND kind = 'standard' AND transport = 'web' AND revoked_at IS NULL
      AND expires_at > statement_timestamp()
    FOR SHARE
  `;
  return session !== undefined;
}

async function reserveSubscription(sql: TransactionSql, scope: Scope, input: Subscription) {
  const { endpoint, keys, expirationTime } = input;
  const [row] = await sql`
    INSERT INTO public.push_subscriptions AS subscription (endpoint, user_id, session_id, p256dh, auth_key, expires_ms)
    VALUES (${endpoint}, ${scope.userId}, ${scope.sessionId}, ${keys.p256dh}, ${keys.auth}, ${expirationTime ?? null})
    ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, session_id = excluded.session_id,
      p256dh = excluded.p256dh, auth_key = excluded.auth_key, expires_ms = excluded.expires_ms
    WHERE subscription.user_id = excluded.user_id OR NOT EXISTS (
      SELECT FROM public.sessions AS session WHERE session.id = subscription.session_id
        AND session.revoked_at IS NULL AND session.expires_at > statement_timestamp()
    )
    RETURNING endpoint
  `;
  return row ? "saved" : "subscription_in_use";
}

async function save(sql: TransactionSql, scope: Scope, input: Subscription) {
  if (!(await lockActiveSession(sql, scope))) return "unauthorized";
  const { userId } = scope;
  await sql`
    DELETE FROM public.push_subscriptions AS subscription USING public.sessions AS session
    WHERE subscription.user_id = ${userId} AND subscription.session_id = session.id
      AND (session.revoked_at IS NOT NULL OR session.expires_at <= statement_timestamp()
        OR subscription.expires_ms <= extract(epoch FROM statement_timestamp()) * 1000)
  `;
  const [otherDevices] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM public.push_subscriptions WHERE user_id = ${userId}
      AND endpoint <> ${input.endpoint}
  `;
  if (otherDevices && otherDevices.count >= maximumDevices) return "subscription_limit";
  return reserveSubscription(sql, scope, input);
}

async function remove(sql: TransactionSql, scope: Scope, endpoint: string) {
  if (!(await lockActiveSession(sql, scope))) return "unauthorized";
  await sql`
    DELETE FROM public.push_subscriptions WHERE user_id = ${scope.userId} AND endpoint = ${endpoint}
  `;
  return "removed" as const;
}

export function createPushSubscriptionRepository({ sql }: DatabaseConnection) {
  return {
    save: (scope: Scope, input: Subscription) => sql.begin((tx) => save(tx, scope, input)),
    remove: (scope: Scope, endpoint: string) => sql.begin((tx) => remove(tx, scope, endpoint)),
  };
}
