import type { ISql } from "postgres";

export async function pruneCourierPositions(sql: ISql, now: Date): Promise<void> {
  await sql`
    DELETE FROM public.courier_positions WHERE (order_id, captured_at) IN (
      SELECT order_id, captured_at FROM public.courier_positions
      WHERE captured_at <= ${now.toISOString()}::timestamptz - interval '30 days'
      ORDER BY captured_at LIMIT 10_000 FOR UPDATE SKIP LOCKED
    )
  `;
}
