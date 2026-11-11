import { beforeAll, expect, test } from "vitest";
import { searchResultsQuery } from "../src/discovery-search-query.ts";
import { createDiscoverySearchRepository } from "../src/discovery-search.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const repository = () => createDiscoverySearchRepository(database.get());
const id = (serial: number) => `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
const communeId = id(1);
const merchantId = id(2);
const demoId = id(3);
const categoryId = id(4);
const shawarmaId = id(5);
const heldId = id(6);
const archivedId = id(7);
const legacyId = id(8);
const rivalId = id(9);

beforeAll(async () => {
  const { sql } = database.get();
  await sql`INSERT INTO wilayas (code, name_ar, name_fr) VALUES (16, 'الجزائر', 'Alger')`;
  await sql`
    INSERT INTO communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    VALUES (${communeId}, '1699', 16, 'الجزائر', 'Alger', ST_SetSRID(ST_MakePoint(3.05, 36.76), 4326))
  `;
  await sql`
    INSERT INTO merchants (id, slug, restaurant_name, owner_name, phone_e164, commune_id,
      location, cuisines, status, created_at, is_demo)
    VALUES (${merchantId}, 'shawarma-alger', 'Shawarma Alger', 'Propriétaire', '+213500000000',
      ${communeId}, ST_SetSRID(ST_MakePoint(3.05, 36.76), 4326), ARRAY['grill'], 'active', now(), false),
      (${demoId}, 'shawarma-demo', 'Shawarma Demo', 'Propriétaire', '+213500000000',
      ${communeId}, ST_SetSRID(ST_MakePoint(3.05, 36.76), 4326), ARRAY['grill'], 'active', now(), true),
      (${rivalId}, 'shawarma-rejected', 'Shawarma Rejected', 'Propriétaire', '+213500000000',
      ${communeId}, ST_SetSRID(ST_MakePoint(3.05, 36.76), 4326), ARRAY['grill'], 'rejected', now(), false)
  `;
  await sql`
    INSERT INTO categories (id, merchant_id, names, sort)
    VALUES (${categoryId}, ${merchantId}, '{"fr":"Grillades"}', 0)
  `;
  await sql`
    INSERT INTO items (id, merchant_id, category_id, names, descriptions, price_dzd, tags,
      prep_extra_min, moderation_status, archived_at)
    VALUES (${shawarmaId}, ${merchantId}, ${categoryId}, '{"fr":"Chawarma","en":"Chicken wrap"}',
      '{"fr":"Poulet et salade"}', 500, '{}', 0, 'approved', NULL),
      (${heldId}, ${merchantId}, ${categoryId}, '{"fr":"Chawarma détenu"}',
      '{"fr":"Poulet"}', 100, '{}', 0, 'blocked_pending_review', NULL),
      (${archivedId}, ${merchantId}, ${categoryId}, '{"fr":"Chawarma archivé"}',
      '{"fr":"Poulet"}', 100, '{}', 0, 'approved', now()),
      (${legacyId}, ${merchantId}, ${categoryId}, '{"fr":"Chawarma"}',
      '{"fr":"Servi avec bière"}', 100, '{}', 0, 'unreviewed', NULL)
  `;
  await repository().refreshMerchant(merchantId);
});

test("[SRCH-04:db] refreshes a restaurant's public multilingual documents idempotently", async () => {
  const repo = repository();
  await repo.refreshMerchant(merchantId);
  await repo.refreshMerchant(merchantId);
  await repo.refreshMerchant(demoId);
  await repo.refreshMerchant(rivalId);
  await expect(repo.search({ q: "Chawarma", limit: 3 })).resolves.toEqual({
    restaurants: [
      { merchantId, slug: "shawarma-alger", name: "Shawarma Alger", coverMediaId: null },
    ],
    dishes: [
      {
        itemId: shawarmaId,
        merchantId,
        merchantSlug: "shawarma-alger",
        merchantName: "Shawarma Alger",
        names: { fr: "Chawarma", en: "Chicken wrap" },
        priceDzd: 500,
        photoMediaId: null,
      },
    ],
  });
});

test.each(["shawarma", "شاورما", "chawerma", "chaw", "chicken wr"])(
  "[SRCH-06:db] finds a localized dish for %s",
  async (q) => {
    await expect(repository().search({ q, limit: 3 })).resolves.toMatchObject({
      dishes: [{ itemId: shawarmaId }],
    });
  },
);

test("[SRCH-05:db] uses query aliases and returns no results for punctuation", async () => {
  const repo = repository();
  await expect(
    repo.search({ q: "sandwich", variants: ["chawarma"], limit: 3 }),
  ).resolves.toMatchObject({
    dishes: [{ itemId: shawarmaId }],
  });
  await expect(repo.search({ q: "|:*'()%_", limit: 3 })).resolves.toEqual({
    restaurants: [],
    dishes: [],
  });
});

test("[SRCH-04:db] live publication, moderation and item edits invalidate stale documents", async () => {
  const repo = repository();
  const { sql } = database.get();
  const search = () => repo.search({ q: "chawarma", limit: 3 });
  await sql`UPDATE merchants SET status = 'paused' WHERE id = ${merchantId}`;
  await expect(search()).resolves.toEqual({ restaurants: [], dishes: [] });
  await sql`UPDATE merchants SET status = 'active' WHERE id = ${merchantId}`;
  await sql`UPDATE items SET moderation_status = 'unreviewed',
    names = '{"fr":"Chawarma","en":"Bière"}' WHERE id = ${shawarmaId}`;
  await expect(search()).resolves.toMatchObject({ dishes: [] });
  await sql`UPDATE items SET moderation_status = 'rejected' WHERE id = ${shawarmaId}`;
  await expect(search()).resolves.toMatchObject({ dishes: [] });
  await sql`UPDATE items SET moderation_status = 'unreviewed', descriptions = '{"fr":"Bière"}'
    WHERE id = ${shawarmaId}`;
  await expect(search()).resolves.toMatchObject({ dishes: [] });
  await sql`UPDATE items SET moderation_status = 'approved', names = '{"fr":"Pizza"}'
    WHERE id = ${shawarmaId}`;
  await expect(search()).resolves.toMatchObject({ dishes: [] });
  await repo.refreshMerchant(merchantId);
  await expect(repo.search({ q: "pizza", limit: 3 })).resolves.toMatchObject({
    dishes: [{ itemId: shawarmaId, names: { fr: "Pizza" } }],
  });
});

test("[SRCH-04:db] menu mutations queue a refresh only when their transaction commits", async () => {
  const repo = repository();
  const { sql } = database.get();
  await Promise.all([merchantId, demoId, rivalId].map((id) => repo.refreshMerchant(id)));
  await expect(repo.listPendingMerchants(10)).resolves.toEqual([]);
  const error = new Error("fixture rollback");
  await expect(
    sql.begin(async (tx) => {
      await tx`UPDATE merchants SET restaurant_name = 'Tacos' WHERE id = ${merchantId}`;
      throw error;
    }),
  ).rejects.toThrow(error);
  await expect(repo.listPendingMerchants(10)).resolves.toEqual([]);
  await sql`UPDATE merchants SET restaurant_name = 'Tacos' WHERE id = ${merchantId}`;
  await expect(repo.listPendingMerchants(10)).resolves.toEqual([merchantId]);
  await sql`UPDATE items SET names = '{"fr":"Tacos"}' WHERE id = ${shawarmaId}`;
  await expect(repo.listPendingMerchants(10)).resolves.toEqual([merchantId]);
  await Promise.all([repo.refreshMerchant(merchantId), repo.refreshMerchant(merchantId)]);
  await expect(repo.listPendingMerchants(10)).resolves.toEqual([]);
  await expect(repo.search({ q: "tacos", limit: 3 })).resolves.toMatchObject({
    restaurants: [{ merchantId, name: "Tacos" }],
    dishes: [{ itemId: shawarmaId, names: { fr: "Tacos" } }],
  });
});

test("[SRCH-04:db] the production match query uses full-text and trigram indexes", async () => {
  const { sql } = database.get();
  const plan = await sql.begin(async (tx) => {
    await tx`SET LOCAL enable_seqscan = off`;
    const terms = [{ text: "shawarma", skeleton: "CRM", prefix: "shawarma:*" }];
    return tx`EXPLAIN (ANALYZE, FORMAT JSON) ${searchResultsQuery(tx, terms, 3)}`;
  });
  const indexes = JSON.stringify(plan);
  expect(indexes).toContain("search_documents_text_idx");
  expect(indexes).toContain("search_documents_skeleton_idx");
  expect(indexes).toContain("search_documents_vector_idx");
});

test("[SRCH-05:db] does not expand one-character prefixes into matching catalog postings", async () => {
  await expect(repository().search({ q: "c", limit: 24 })).resolves.toEqual({
    restaurants: [],
    dishes: [],
  });
});
