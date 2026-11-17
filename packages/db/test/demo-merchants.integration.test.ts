import { findProhibitedGoods } from "@zaafran/domain/moderation";
import { expect, test } from "vitest";
import { seedDemoMerchants } from "../src/demo-merchants.ts";
import { seedGeography } from "../src/geography.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();

interface Translations {
  readonly ar?: string;
  readonly fr?: string;
  readonly en?: string;
}

async function readDemoMenu() {
  const { sql } = database.get();
  return sql<
    {
      id: string;
      slug: string;
      status: string;
      phone: string;
      wilaya: number;
      categories: { names: Translations }[];
      items: {
        names: Translations;
        descriptions: Translations;
        priceDzd: number;
        status: string;
      }[];
    }[]
  >`
    SELECT merchant.id, merchant.slug, merchant.status, merchant.phone_e164 AS phone,
      commune.wilaya_code AS wilaya,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('names', category.names) ORDER BY category.sort), '[]')
        FROM categories AS category WHERE category.merchant_id = merchant.id) AS categories,
      (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'names', item.names, 'descriptions', item.descriptions,
          'priceDzd', item.price_dzd, 'status', item.moderation_status) ORDER BY item.id), '[]')
        FROM items AS item WHERE item.merchant_id = merchant.id) AS items
    FROM merchants AS merchant
    JOIN communes AS commune ON commune.id = merchant.commune_id
    WHERE merchant.is_demo
    ORDER BY merchant.slug
  `;
}

test("seeds twelve fictional bilingual Algiers demo restaurants with listable menus", async () => {
  const connection = database.get();
  await seedGeography(connection);
  await seedDemoMerchants(connection);

  const merchants = await readDemoMenu();
  expect(merchants).toHaveLength(12);
  expect(new Set(merchants.map(({ slug }) => slug)).size).toBe(12);
  for (const merchant of merchants) {
    expect(merchant).toMatchObject({ status: "active", wilaya: 16 });
    expect(merchant.slug).toMatch(/^demo-[a-z0-9-]+$/);
    // D-022: demo phones come from one reserved block and are never sent anything.
    expect(merchant.phone).toMatch(/^\+2135509999\d{2}$/);
    expect(merchant.categories.length).toBeGreaterThanOrEqual(2);
    for (const { names } of merchant.categories) expectBilingual(names);
    expect(merchant.items.length).toBeGreaterThanOrEqual(5);
    for (const item of merchant.items) {
      expectBilingual(item.names);
      expectBilingual(item.descriptions);
      expect(item.status).toBe("unreviewed");
      expect(item.priceDzd % 10).toBe(0);
      expect(item.priceDzd).toBeGreaterThan(0);
      const texts = [item.names, item.descriptions].flatMap(({ ar, fr }) => [ar ?? "", fr ?? ""]);
      expect(findProhibitedGoods(texts)).toEqual([]);
    }
  }
});

test("seeding the demo restaurants again changes nothing", async () => {
  const connection = database.get();
  await seedGeography(connection);
  await seedDemoMerchants(connection);
  const first = await readDemoMenu();
  await seedDemoMerchants(connection);
  expect(await readDemoMenu()).toEqual(first);
  const [{ count } = { count: -1 }] = await connection.sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM merchants WHERE NOT is_demo
  `;
  expect(count).toBe(0);
});

function expectBilingual(text: Translations) {
  expect(Object.keys(text).sort()).toEqual(["ar", "fr"]);
  expect(text.ar).toMatch(/\p{Script=Arabic}/u);
  expect(text.fr).toMatch(/[a-z]/i);
}
