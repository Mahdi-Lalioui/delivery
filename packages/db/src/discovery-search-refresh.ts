import { findProhibitedGoods } from "@zaafran/domain/moderation";
import { normalize, skeleton } from "@zaafran/domain/search";
import type { TransactionSql } from "postgres";
import type { MenuItem } from "./menu-item-queries.js";

type SearchItem = Pick<MenuItem, "itemId" | "names" | "descriptions" | "moderationStatus">;
type EntityType = "restaurant" | "dish";

function translations({ ar, fr, en }: MenuItem["names"]) {
  return [ar, fr, en].filter((value) => value !== undefined);
}

function documentRows(
  entity: { type: EntityType; id: string; merchantId: string },
  names: readonly string[],
  screenedContent: string | null,
) {
  return [...new Set(names)].flatMap((name) => {
    const text = normalize(name);
    if (!text) return [];
    return [
      {
        entity_type: entity.type,
        entity_id: entity.id,
        merchant_id: entity.merchantId,
        source_text: name,
        screened_content: screenedContent,
        normalized_text: text,
        skeleton: skeleton(text),
      },
    ];
  });
}

function itemDocuments(merchantId: string, item: SearchItem) {
  const names = translations(item.names);
  const screened = findProhibitedGoods([...names, ...translations(item.descriptions)]).length === 0;
  if (!screened && item.moderationStatus !== "approved") return [];
  return documentRows(
    { type: "dish", id: item.itemId, merchantId },
    names,
    screened ? JSON.stringify([item.names, item.descriptions]) : null,
  );
}

async function readDocuments(sql: TransactionSql, merchantId: string, name: string) {
  const items = await sql<SearchItem[]>`
    SELECT id AS "itemId", names, descriptions, moderation_status AS "moderationStatus"
    FROM public.items WHERE merchant_id = ${merchantId} AND archived_at IS NULL
      AND moderation_status IN ('unreviewed', 'approved')
  `;
  return [
    ...documentRows({ type: "restaurant", id: merchantId, merchantId }, [name], null),
    ...items.flatMap((item) => itemDocuments(merchantId, item)),
  ];
}

export async function refreshSearchDocuments(sql: TransactionSql, merchantId: string) {
  const [merchant] = await sql<{ name: string; isPublic: boolean }[]>`
    SELECT restaurant_name AS name, (status = 'active' AND NOT is_demo) AS "isPublic"
    FROM public.merchants WHERE id = ${merchantId} FOR NO KEY UPDATE
  `;
  if (!merchant) return;

  // Read the version before projecting. A concurrent writer either changes it
  // before our compare-and-delete, or recreates the queue row after we commit.
  const [pending] = await sql<{ version: string }[]>`
    SELECT version::text FROM public.search_document_refreshes WHERE merchant_id = ${merchantId}
  `;
  const documents = merchant.isPublic ? await readDocuments(sql, merchantId, merchant.name) : [];
  await sql`DELETE FROM public.search_documents WHERE merchant_id = ${merchantId}`;
  // Limit parameters per INSERT for legacy menus with many items or translations.
  for (let start = 0; start < documents.length; start += 1000) {
    await sql`INSERT INTO public.search_documents ${sql(documents.slice(start, start + 1000))}`;
  }
  if (pending) {
    await sql`
      DELETE FROM public.search_document_refreshes
      WHERE merchant_id = ${merchantId} AND version = ${pending.version}::bigint
    `;
  }
}
