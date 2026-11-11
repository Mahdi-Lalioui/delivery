import type { TransactionSql } from "postgres";
import type { MenuItem } from "./menu-item-queries.js";

type Restaurant = {
  merchantId: string;
  slug: string;
  name: string;
  coverMediaId: string | null;
};

type Dish = {
  itemId: string;
  merchantId: string;
  merchantSlug: string;
  merchantName: string;
  names: MenuItem["names"];
  priceDzd: number;
  photoMediaId: null;
};

export interface SearchResults {
  readonly restaurants: Restaurant[];
  readonly dishes: Dish[];
}

export interface SearchTerm {
  readonly text: string;
  readonly skeleton: string;
  readonly prefix: string;
}

export function searchResultsQuery(
  sql: TransactionSql,
  terms: readonly SearchTerm[],
  limit: number,
) {
  // Give the planner the term count and compute the index operands once per alias.
  const termRows = terms.map(({ text, skeleton, prefix }) => [text, skeleton, prefix]);
  return sql<SearchResults[]>`
    WITH terms AS MATERIALIZED (
      SELECT text, skeleton, to_tsquery('simple', prefix) AS prefix_query,
        CASE WHEN length(skeleton) >= 2 THEN skeleton END AS exact_skeleton,
        CASE WHEN length(skeleton) >= 3 THEN skeleton END AS fuzzy_skeleton
      FROM (VALUES ${sql(termRows)}) AS term(text, skeleton, prefix)
    ), matches AS (
      SELECT candidate.*
      FROM terms AS term
      CROSS JOIN LATERAL (
        SELECT doc.*, greatest(
          CASE WHEN doc.normalized_text = term.text THEN 1 ELSE 0 END,
          CASE WHEN doc.search_vector @@ term.prefix_query THEN 0.85 ELSE 0 END,
          CASE WHEN doc.skeleton <> '' AND doc.skeleton = term.skeleton THEN 0.8 ELSE 0 END,
          similarity(doc.normalized_text, term.text),
          word_similarity(term.text, doc.normalized_text) * 0.75,
          similarity(doc.skeleton, term.skeleton) * 0.7
        ) AS score
        FROM public.search_documents AS doc
        WHERE doc.search_vector @@ term.prefix_query
          OR doc.normalized_text % term.text OR doc.normalized_text %> term.text
          OR doc.skeleton = term.exact_skeleton OR doc.skeleton % term.fuzzy_skeleton
        OFFSET 0
      ) AS candidate
    ), restaurants AS (
      SELECT merchant.id AS "merchantId", merchant.slug, merchant.restaurant_name AS name,
        cover.id AS "coverMediaId", max(matches.score) AS score
      FROM matches
      JOIN public.merchants AS merchant ON merchant.id = matches.merchant_id
        AND merchant.status = 'active' AND NOT merchant.is_demo
        AND merchant.restaurant_name = matches.source_text
      LEFT JOIN public.media_uploads AS cover ON cover.id = merchant.cover_photo_id
        AND cover.merchant_id = merchant.id AND cover.kind = 'cover' AND cover.status = 'ready'
      WHERE matches.entity_type = 'restaurant'
      GROUP BY merchant.id, cover.id
      ORDER BY score DESC, merchant.id LIMIT ${limit}
    ), dishes AS (
      SELECT item.id AS "itemId", merchant.id AS "merchantId", merchant.slug AS "merchantSlug",
        merchant.restaurant_name AS "merchantName", item.names, item.price_dzd AS "priceDzd",
        NULL::uuid AS "photoMediaId", max(matches.score) AS score
      FROM matches
      JOIN public.merchants AS merchant ON merchant.id = matches.merchant_id
        AND merchant.status = 'active' AND NOT merchant.is_demo
      JOIN public.items AS item ON item.id = matches.entity_id AND item.merchant_id = merchant.id
        AND item.archived_at IS NULL
        AND (item.moderation_status = 'approved' OR (item.moderation_status = 'unreviewed'
          AND matches.screened_content = jsonb_build_array(item.names, item.descriptions)))
        AND matches.source_text IN (item.names->>'ar', item.names->>'fr', item.names->>'en')
      WHERE matches.entity_type = 'dish'
      GROUP BY item.id, merchant.id
      ORDER BY score DESC, item.id LIMIT ${limit}
    )
    SELECT
      coalesce((SELECT jsonb_agg(to_jsonb(restaurants) - 'score' ORDER BY score DESC, "merchantId")
        FROM restaurants), '[]'::jsonb) AS restaurants,
      coalesce((SELECT jsonb_agg(to_jsonb(dishes) - 'score' ORDER BY score DESC, "itemId")
        FROM dishes), '[]'::jsonb) AS dishes
  `;
}
