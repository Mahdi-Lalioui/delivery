import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buffer } from "node:stream/consumers";
import { createLocalMediaStore } from "@zaafran/media";
import { expect, onTestFinished, test } from "vitest";
import { seedDemoRestaurants } from "../src/demo-seed.ts";
import { seedGeography } from "../src/geography.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();

async function readDemo() {
  const { sql } = database.get();
  return sql<
    {
      id: string;
      slug: string;
      restaurant_name: string;
      status: string;
      inside: boolean;
      commune_code: string;
      owner_blocked: boolean;
      cover_ready: boolean;
      review_count: number;
      categories: string[];
      items: string[];
      photo_id: string;
      variants: unknown[];
    }[]
  >`
    SELECT merchant.id, merchant.slug, merchant.restaurant_name, merchant.status,
      ST_Within(merchant.location::geometry, commune.boundary) AS inside,
      commune.code AS commune_code, owner.blocked_at IS NOT NULL AS owner_blocked,
      (SELECT jsonb_agg(category.id ORDER BY category.sort) FROM public.categories AS category
        WHERE category.merchant_id = merchant.id AND category.names ?& ARRAY['ar', 'fr']) AS categories,
      (SELECT jsonb_agg(item.id ORDER BY item.id) FROM public.items AS item
        WHERE item.merchant_id = merchant.id AND item.names ?& ARRAY['ar', 'fr']
          AND item.descriptions ?& ARRAY['ar', 'fr'] AND item.moderation_status = 'unreviewed') AS items,
      photo.id AS photo_id, photo.ready_variants AS variants,
      EXISTS (SELECT FROM public.media_uploads AS cover WHERE cover.id = merchant.cover_photo_id
        AND cover.merchant_id = merchant.id AND cover.status = 'ready' AND cover.kind = 'cover')
        AS cover_ready,
      (SELECT count(*)::int FROM public.orders AS purchase
        JOIN public.ratings AS rating ON rating.order_id = purchase.id
        WHERE purchase.merchant_id = merchant.id AND purchase.status = 'collected'
          AND purchase.customer_id IS NULL AND rating.comment <> '') AS review_count
    FROM public.merchants AS merchant
    JOIN public.communes AS commune ON commune.id = merchant.commune_id
    JOIN public.merchant_members AS member ON member.merchant_id = merchant.id AND member.role = 'owner'
    JOIN public.users AS owner ON owner.id = member.user_id
    JOIN public.media_uploads AS photo ON photo.merchant_id = merchant.id AND photo.owner_id = owner.id
      AND photo.status = 'ready' AND photo.kind = 'item'
    WHERE merchant.is_demo AND EXISTS (
      SELECT FROM public.items AS pictured WHERE pictured.merchant_id = merchant.id AND pictured.photo_id = photo.id
    )
    ORDER BY merchant.slug
  `;
}

test("[MER-09:demo] seeds forty bilingual restaurants across eight cities and preserves identities on repeat", async () => {
  const connection = database.get();
  const { sql } = connection;
  const root = await mkdtemp(join(tmpdir(), "zaafran-demo-media-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const store = createLocalMediaStore({ root });
  await seedGeography(connection);
  await sql`
    INSERT INTO public.merchants (slug, restaurant_name, owner_name, phone_e164, commune_id,
      location, cuisines, status, created_at)
    SELECT 'other-merchant', 'Other restaurant', 'Local fixture', '+213500000399', id, centroid,
      ARRAY['algerian'], 'pending_review', '2026-01-01'
    FROM public.communes WHERE code = '1601'
  `;
  const unrelated = await sql`SELECT * FROM public.merchants WHERE NOT is_demo`;
  await expect(
    seedDemoRestaurants(connection, {
      ...store,
      put: () => Promise.reject(new Error("Demo store unavailable")),
    }),
  ).rejects.toThrow("Demo store unavailable");
  expect(await sql`SELECT id FROM public.merchants WHERE is_demo`).toEqual([]);

  await seedDemoRestaurants(connection, store);
  const before = await readDemo();
  expect(before).toHaveLength(40);
  expect(new Set(before.map((row) => row.commune_code.slice(0, 2)))).toEqual(
    new Set(["06", "13", "16", "19", "23", "25", "31", "47"]),
  );
  expect(new Set(before.map((row) => row.restaurant_name)).size).toBe(40);
  for (const row of before) {
    expect(row).toMatchObject({
      inside: true,
      status: "approved",
      owner_blocked: true,
      cover_ready: true,
      review_count: 3,
    });
    expect(row.restaurant_name).toMatch(/\p{Script=Arabic}/u);
    expect(row.restaurant_name).toMatch(/\p{Script=Latin}/u);
    expect(row.categories).toHaveLength(2);
    expect(row.items).toHaveLength(5);
    expect(row.variants).toHaveLength(10);
  }

  const pictures = await sql<{ key: string; bytes: number; format: string }[]>`
    SELECT DISTINCT variant.key, variant.bytes, variant.format FROM public.media_uploads AS photo
    JOIN public.merchants AS merchant ON merchant.id = photo.merchant_id AND merchant.is_demo
    CROSS JOIN LATERAL jsonb_to_recordset(photo.ready_variants) AS variant(key text, bytes int, format text)
  `;
  expect(pictures.length).toBeGreaterThan(10);
  for (const { key, bytes, format } of pictures) {
    const object = await store.get(key);
    if (!object) throw new Error("Missing seeded photo variant.");
    const contents = await buffer(object.body);
    expect(contents.length).toBe(bytes);
    expect(contents.subarray(8, 12).toString("ascii")).toBe(format === "webp" ? "WEBP" : "avif");
  }

  await seedDemoRestaurants(connection, store);
  expect(await readDemo()).toEqual(before);
  expect(await sql`SELECT * FROM public.merchants WHERE NOT is_demo`).toEqual(unrelated);
  expect(await sql`SELECT id FROM public.merchants WHERE is_demo`).toHaveLength(40);
}, 60_000);
