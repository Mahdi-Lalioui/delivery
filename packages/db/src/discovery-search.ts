import { normalize, skeleton } from "@zaafran/domain/search";
import type { TransactionSql } from "postgres";
import type { DatabaseConnection } from "./database.js";
import {
  searchResultsQuery,
  type SearchResults,
  type SearchTerm,
} from "./discovery-search-query.js";
import { refreshSearchDocuments } from "./discovery-search-refresh.js";

interface SearchQuery {
  readonly q: string;
  readonly limit: number;
  readonly variants?: readonly string[];
}

function searchTerms(q: string, variants: readonly string[]): SearchTerm[] {
  return [
    ...new Set([q, ...variants].map((value) => normalize(value.replaceAll("\0", "")))),
  ].flatMap((text) => {
    // Construct the prefix tsquery only from word characters, never query operators.
    const words = text.match(/[\p{Letter}\p{Mark}\p{Number}]+/gu);
    if (!words?.length) return [];
    return [
      { text, skeleton: skeleton(text), prefix: words.map((word) => word + ":*").join(" & ") },
    ];
  });
}

async function readResults(
  sql: TransactionSql,
  terms: ReturnType<typeof searchTerms>,
  limit: number,
): Promise<SearchResults> {
  await sql`SET LOCAL statement_timeout = '500ms'`;
  // A fresh reindex can make the GIN pending lists look more expensive than a catalog scan.
  await sql`SET LOCAL enable_seqscan = off`;
  await sql`SET LOCAL pg_trgm.similarity_threshold = 0.3`;
  await sql`SET LOCAL pg_trgm.word_similarity_threshold = 0.3`;
  const [results] = await searchResultsQuery(sql, terms, limit);
  return results ?? { restaurants: [], dishes: [] };
}

export function createDiscoverySearchRepository({ sql }: DatabaseConnection) {
  return {
    search: ({ q, limit, variants = [] }: SearchQuery) => {
      const terms =
        normalize(q).replace(/[^\p{Letter}\p{Number}]/gu, "").length < 2
          ? []
          : searchTerms(q, variants);
      if (terms.length === 0)
        return Promise.resolve<SearchResults>({ restaurants: [], dishes: [] });
      return sql.begin("read only", (tx) => readResults(tx, terms, limit));
    },
    refreshMerchant: (merchantId: string) =>
      sql.begin((tx) => refreshSearchDocuments(tx, merchantId)),
    listPendingMerchants: async (limit: number) => {
      const rows = await sql<{ merchantId: string }[]>`
        SELECT merchant_id AS "merchantId" FROM public.search_document_refreshes
        ORDER BY requested_at, merchant_id LIMIT ${limit}
      `;
      return rows.map(({ merchantId }) => merchantId);
    },
  };
}
