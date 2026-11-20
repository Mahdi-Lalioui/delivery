import type { Sql } from "postgres";

type Outcome = "accepted" | "rejected" | "uncertain";
type Delivery = {
  invitationId: string;
  merchantId: string;
  now: Date;
  send: () => Promise<Outcome>;
};
type Target = { kind: "staff"; tokenHash: Uint8Array } | { kind: "courier" };

export async function deliverInvitation(sql: Sql, request: Delivery, target: Target) {
  const staff = target.kind === "staff";
  const table = staff ? sql`public.merchant_staff_invitations` : sql`public.courier_invitations`;
  const identity = sql`id = ${request.invitationId} AND merchant_id = ${request.merchantId}
    ${staff ? sql`AND token_hash = ${target.tokenHash}` : sql``}`;
  const open = sql`revoked_at IS NULL AND expires_at > ${request.now.toISOString()}
    AND ${staff ? sql`consumed_at` : sql`accepted_at`} IS NULL`;
  // Commit before the external call. A process crash or lost provider response leaves the
  // claim in place, including when the provider accepted the message before the failure.
  const claim = await sql`UPDATE ${table} SET delivery_state = 'uncertain'
    WHERE ${identity} AND ${open} AND delivery_state = 'ready' RETURNING id`;
  if (!claim.count) {
    const sent = await sql`SELECT 1 FROM ${table} WHERE ${identity} AND delivery_state = 'sent'`;
    return sent.count === 1;
  }
  const outcome = await request.send();
  if (outcome === "uncertain") return false;
  const updated =
    await sql`UPDATE ${table} SET delivery_state = ${outcome === "accepted" ? "sent" : "ready"}
    WHERE ${identity} AND delivery_state = 'uncertain'`;
  return outcome === "accepted" && updated.count === 1;
}

export type InviteDelivery = Delivery;
