import process from "node:process";
import { beforeAll, expect, test } from "vitest";
import searchSynonyms from "../../i18n/search-synonyms.json" with { type: "json" };
import { createDiscoverySearchRepository } from "../src/discovery-search.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const aliasGroups = Object.values(searchSynonyms);
const queries = [
  ["Chawarma", "chawarma", "shawarma", "شاورما", "chawerma"],
  ["Tacos", "tacos", "tacose", "طاكوس"],
  ["Pizza", "pizza", "piza", "بيتزا"],
  ["Mhadjeb", "mhadjeb", "محاجب"],
  ["Garantita", "garantita", "كرانتيكا"],
  ["Kesksou", "kesksou", "كسكس"],
  ["Djaj", "djaj", "دجاج"],
  ["Zlabia", "زلابية"],
  ["Chorba", "chorba"],
  ["Burger", "burger", "برغر"],
] as const;

beforeAll(async () => {
  const { sql } = database.get();
  await sql`INSERT INTO wilayas (code, name_ar, name_fr) VALUES (16, 'الجزائر', 'Alger')`;
  const [commune] = await sql<{ id: string }[]>`
    INSERT INTO communes (code, wilaya_code, name_ar, name_fr, centroid)
    VALUES ('1699', 16, 'الجزائر', 'Alger', ST_SetSRID(ST_MakePoint(3.05, 36.76), 4326))
    RETURNING id
  `;
  if (!commune) throw new Error("Missing benchmark commune");
  const merchants = await sql<{ id: string }[]>`
    INSERT INTO merchants (slug, restaurant_name, owner_name, phone_e164, commune_id,
      location, cuisines, status, created_at)
    SELECT 'fixture-' || n, 'Table fictive ' || n, 'Synthetic owner', '+213500000000',
      ${commune.id}, ST_SetSRID(ST_MakePoint(3.05, 36.76), 4326), ARRAY['grill'], 'active', now()
    FROM generate_series(1, 500) AS n
    RETURNING id
  `;
  const arabic = queries.map(
    (row) => row.find((value) => /\p{Script=Arabic}/u.test(value)) ?? null,
  );
  await sql`
    WITH created AS (
      INSERT INTO categories (merchant_id, names, sort)
      SELECT id, '{"fr":"Menu fictif"}', 0 FROM merchants RETURNING id, merchant_id
    )
    INSERT INTO items (merchant_id, category_id, names, descriptions, price_dzd, tags,
      prep_extra_min, moderation_status)
    SELECT category.merchant_id, category.id,
      jsonb_strip_nulls(jsonb_build_object('ar', CASE WHEN n <= 10 AND merchant.slug = 'fixture-1'
        THEN (${arabic}::text[])[n] END, 'fr', CASE
        WHEN n <= 10 AND merchant.slug = 'fixture-1' THEN (${queries.map(([name]) => name)}::text[])[n]
        ELSE (ARRAY['Salade', 'Soupe', 'Brochette', 'Dessert', 'Pain', 'Jus'])[1 + n % 6]
          || ' ' || n || ' ' || merchant.slug END)),
      '{"fr":"Plat de démonstration"}', 500, '{}', 0, 'approved'
    FROM created category JOIN merchants merchant ON merchant.id = category.merchant_id
    CROSS JOIN generate_series(1, 60) AS n
  `;
  // Keep the freshly populated GIN pending lists throughout the measurements.
  await sql`ALTER TABLE search_documents SET (autovacuum_enabled = false)`;
  const repo = createDiscoverySearchRepository(database.get());
  for (let index = 0; index < merchants.length; index += 8) {
    await Promise.all(merchants.slice(index, index + 8).map(({ id }) => repo.refreshMerchant(id)));
  }
  await sql`ANALYZE search_documents`;
}, 60_000);

test("[SRCH-06:db] golden queries find their dish in the top three at production scale", async () => {
  const repo = createDiscoverySearchRepository(database.get());
  const timings: number[] = [];
  for (const [name, ...variants] of queries) {
    for (const q of variants) {
      const aliases = aliasGroups.find((group) => group.includes(q)) ?? [];
      const start = performance.now();
      const result = await repo.search({
        q,
        variants: aliases.filter((alias) => alias !== q),
        limit: 3,
      });
      timings.push(performance.now() - start);
      expect(
        result.dishes.map((dish) => dish.names.fr),
        q,
      ).toContain(name);
    }
  }
  timings.sort((a, b) => a - b);
  const p95 = timings[Math.ceil(timings.length * 0.95) - 1] ?? Infinity;
  process.stdout.write(
    `Discovery search p95 (${String(timings.length)} queries): ${p95.toFixed(1)} ms\n`,
  );
  expect(p95, "Search p95 at 500 restaurants and 30,000 items").toBeLessThan(120);
});
