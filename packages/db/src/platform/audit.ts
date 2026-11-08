import {
  adminAuditOutput,
  adminAuditQuery,
  readAdminAuditCursor,
} from "@zaafran/contracts/admin-ops";
import type { TransactionSql } from "postgres";
import { timestampParsers } from "../timestamp-parsers.js";

type AuditQuery = ReturnType<typeof adminAuditQuery.parse>;
type AuditEvent = ReturnType<typeof adminAuditOutput.parse>["events"][number];
interface AuditRow extends Omit<AuditEvent, "createdAt"> {
  readonly createdAt: Date;
}

const auditResult = adminAuditOutput.omit({ sessionId: true });

export async function readAudit(sql: TransactionSql, filter: AuditQuery) {
  const { actorId, entity, from, to, cursor, limit } = adminAuditQuery.parse({
    ...filter,
    limit: String(filter.limit),
  });
  const after = cursor ? readAdminAuditCursor(cursor) : undefined;
  const actorCondition = actorId ? sql`AND actor_id = ${actorId}` : sql``;
  const entityCondition = entity ? sql`AND entity = ${entity}` : sql``;
  const fromCondition = from ? sql`AND created_at >= ${from}::timestamptz` : sql``;
  const toCondition = to ? sql`AND created_at < ${to}::timestamptz` : sql``;
  const cursorCondition = after
    ? sql`AND (created_at, id) < (${after.createdAt}::timestamptz, ${after.id}::uuid)`
    : sql``;
  const rows = await sql<AuditRow[]>`
    SELECT id, actor_id AS "actorId", entity, entity_id AS "entityId",
      entity || '_updated' AS action, reason, created_at AS "createdAt"
    FROM public.platform_command_receipts WHERE true
    ${actorCondition} ${entityCondition} ${fromCondition} ${toCondition} ${cursorCondition}
    ORDER BY created_at DESC, id DESC LIMIT ${limit + 1}
  `.parsers(timestampParsers);
  const events = rows.slice(0, limit).map(({ createdAt, ...event }) => ({
    ...event,
    createdAt: createdAt.toISOString(),
  }));
  const last = events.at(-1);
  return auditResult.parse({
    events,
    nextCursor: rows.length > limit && last ? `${last.createdAt}~${last.id}` : null,
  });
}
