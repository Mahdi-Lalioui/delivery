import { merchantPromotionOutput } from "@zaafran/contracts/promotions";
import type { TransactionSql } from "postgres";

const promotionLimit = 100;

interface PromotionRow {
  readonly promotionId: string;
  readonly merchantId: string;
  readonly code: string | null;
  readonly discount: unknown;
  readonly conditions: unknown;
  readonly uses: number;
  readonly salesDzd: number;
}

export async function readPromotions(
  sql: TransactionSql,
  merchantId: string,
  promotionId?: string,
) {
  const target = promotionId === undefined ? sql`` : sql`AND id = ${promotionId}`;
  const rows = await sql<PromotionRow[]>`
    SELECT promotion.id AS "promotionId", promotion.merchant_id AS "merchantId", promotion.code,
      promotion.discount, promotion.conditions, redemption.uses, redemption."salesDzd"
    FROM (
      SELECT id, merchant_id, code, discount, conditions
      FROM public.promotions
      WHERE merchant_id = ${merchantId} ${target}
      ORDER BY id
      LIMIT ${promotionLimit}
    ) AS promotion
    CROSS JOIN LATERAL (
      SELECT count(*)::double precision AS uses,
        coalesce(sum(sales_dzd), 0)::double precision AS "salesDzd"
      FROM public.promotion_redemptions
      WHERE promotion_id = promotion.id
    ) AS redemption
    ORDER BY promotion.id
  `;
  return rows.map(({ code, uses, salesDzd, ...promotion }) =>
    merchantPromotionOutput.parse({
      ...promotion,
      activation: code === null ? { kind: "automatic" } : { kind: "code", code },
      stats: { uses, salesDzd },
    }),
  );
}

export async function hasReachedPromotionLimit(sql: TransactionSql, merchantId: string) {
  const rows = await sql`
    SELECT id FROM public.promotions WHERE merchant_id = ${merchantId}
    ORDER BY id OFFSET ${promotionLimit - 1} LIMIT 1
  `;
  return rows.length !== 0;
}
