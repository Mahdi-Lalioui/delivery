import { createHash } from "node:crypto";
import { findProhibitedGoods } from "@zaafran/domain/moderation";
import type { MediaStore } from "@zaafran/media";
import type { TransactionSql } from "postgres";
import type { DatabaseConnection } from "./database.ts";
import { publishDemoPhoto, type DemoPhoto } from "./demo-seed-media.ts";
import {
  demoMenus,
  demoRestaurants,
  type DemoMenu,
  type DemoRestaurant,
} from "./demo-seed-menu.ts";

const createdAt = "2026-01-01T00:00:00.000Z";
const demoPhone = "+213500000000";
const demoOwnerName = "Compte de démonstration · حساب تجريبي";

function demoId(...parts: string[]): string {
  // A project-scoped UUIDv8 keeps fixture identities stable when rows are added or reordered.
  const hex = createHash("sha256")
    .update(["zaafran-demo-v1", ...parts].join("\0"))
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const ownerId = demoId("owner");
const fixtureSessionId = demoId("media-provenance");

async function seedDemoOwner(sql: TransactionSql): Promise<void> {
  await sql`
    INSERT INTO public.users (id, phone_e164, created_at, blocked_at)
    VALUES (${ownerId}, ${demoPhone}, ${createdAt}, ${createdAt}) ON CONFLICT (id) DO NOTHING
  `;
  const [owner] = await sql`
    SELECT id FROM public.users WHERE id = ${ownerId} AND phone_e164 = ${demoPhone}
      AND blocked_at IS NOT NULL AND deleted_at IS NULL
  `;
  if (!owner) throw new Error("The reserved demo owner conflicts with an existing account.");
}

async function seedMerchant(
  sql: TransactionSql,
  [key, communeCode, cuisine, name]: DemoRestaurant,
) {
  const id = demoId("merchant", key);
  const slug = `demo-${key}`;
  await sql`
    INSERT INTO public.merchants (id, slug, restaurant_name, owner_name, phone_e164, commune_id,
      location, cuisines, status, created_at, reviewed_at, is_demo)
    SELECT ${id}, ${slug}, ${`${name.fr} · ${name.ar}`}, ${demoOwnerName}, ${demoPhone}, commune.id,
      ST_PointOnSurface(commune.boundary)::geography, ARRAY[${cuisine}::text], 'approved',
      ${createdAt}, ${createdAt}, true
    FROM public.communes AS commune
    WHERE commune.code = ${communeCode} AND commune.boundary IS NOT NULL
    ON CONFLICT (id) DO NOTHING
  `;
  const [merchant] = await sql`
    SELECT id FROM public.merchants WHERE id = ${id} AND slug = ${slug} AND is_demo
  `;
  if (!merchant) throw new Error(`Cannot seed ${slug}. Its commune boundary must exist.`);
  await sql`
    INSERT INTO public.merchant_members (merchant_id, user_id, role)
    VALUES (${id}, ${ownerId}, 'owner') ON CONFLICT (merchant_id, user_id) DO NOTHING
  `;
  return id;
}

async function seedDemoPhoto(sql: TransactionSql, merchantId: string, photo: DemoPhoto) {
  const id = demoId(photo.kind === "item" ? "photo" : "cover", merchantId);
  // As with a worker-published row, only the ready variants remain in storage.
  await sql`
    INSERT INTO public.media_uploads AS existing (id, owner_id, merchant_id, kind, content_type,
      bytes, status, quarantine_key, content_digest, created_at, adopted_at,
      reservation_session_id, preview_key, preview_width, preview_height, crop_focal_x,
      crop_focal_y, crop_zoom_percent, ready_variants, thumbhash)
    VALUES (${id}, ${ownerId}, ${merchantId}, ${photo.kind}, 'image/png', ${photo.bytes}, 'ready',
      ${`demo-menu-v1/source/${id}`}, ${photo.digest}, ${createdAt}, ${createdAt},
      ${fixtureSessionId}, ${`demo-menu-v1/preview/${id}`}, 640, 480, 5000, 5000, 100,
      ${JSON.stringify(photo.variants)}::jsonb, ${photo.thumbhash})
    ON CONFLICT (id) DO UPDATE SET ready_variants = EXCLUDED.ready_variants, thumbhash = EXCLUDED.thumbhash,
      bytes = EXCLUDED.bytes, content_digest = EXCLUDED.content_digest
    WHERE existing.owner_id = EXCLUDED.owner_id AND existing.merchant_id = EXCLUDED.merchant_id
      AND existing.status = 'ready' AND existing.kind = EXCLUDED.kind
      AND (existing.ready_variants, existing.thumbhash, existing.bytes, existing.content_digest)
        IS DISTINCT FROM (EXCLUDED.ready_variants, EXCLUDED.thumbhash, EXCLUDED.bytes, EXCLUDED.content_digest)
  `;
  return id;
}

function menuRows(merchantId: string, menu: DemoMenu, photoId: string) {
  const categories = demoMenus[menu].map((category, position) => ({
    id: demoId("category", merchantId, category.key),
    names: category.names,
    sort: position,
  }));
  const items = demoMenus[menu].flatMap((category, position) =>
    category.dishes.map((dish, index) => {
      const texts = [dish.names.ar, dish.names.fr, dish.descriptions.ar, dish.descriptions.fr];
      if (findProhibitedGoods(texts).length > 0)
        throw new Error(`Demo item failed moderation: ${dish.key}.`);
      return {
        id: demoId("item", merchantId, category.key, dish.key),
        category_id: demoId("category", merchantId, category.key),
        names: dish.names,
        descriptions: dish.descriptions,
        price_dzd: dish.priceDzd,
        photo_id: position === 0 && index === 0 ? photoId : null,
      };
    }),
  );
  return { categories, items };
}

async function seedMenu(
  sql: TransactionSql,
  merchantId: string,
  { categories, items }: ReturnType<typeof menuRows>,
) {
  await sql`
    INSERT INTO public.categories (id, merchant_id, names, sort)
    SELECT category.id, ${merchantId}, category.names, category.sort
    FROM jsonb_to_recordset(${JSON.stringify(categories)}::jsonb) AS category(id uuid, names jsonb, sort integer)
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO public.items (id, merchant_id, category_id, names, descriptions, price_dzd, tags,
      prep_extra_min, photo_id)
    SELECT item.id, ${merchantId}, item.category_id, item.names, item.descriptions, item.price_dzd,
      '{}'::text[], 0, item.photo_id
    FROM jsonb_to_recordset(${JSON.stringify(items)}::jsonb) AS item(id uuid, category_id uuid,
      names jsonb, descriptions jsonb, price_dzd integer, photo_id uuid)
    ON CONFLICT (id) DO NOTHING
  `;
}

const reviews = [
  {
    code: "AWD-2A2",
    stars: 5,
    comment: "Plat bien chaud et accueil souriant. · طبق ساخن واستقبال طيب.",
  },
  { code: "AWD-2A3", stars: 4, comment: "Bon repas, prêt à l’heure. · وجبة لذيذة جاهزة في الوقت." },
  { code: "AWD-2A4", stars: 5, comment: "Portion généreuse, je reviendrai. · حصة سخية، سأعود." },
];

async function seedReviews(sql: TransactionSql, merchantId: string, menu: DemoMenu) {
  const category = demoMenus[menu][0];
  const dish = category?.dishes[0];
  if (!category || !dish) throw new Error("A demo review needs a dish.");
  const lines = [
    {
      itemId: demoId("item", merchantId, category.key, dish.key),
      names: dish.names,
      quantity: 1,
      unitPriceDzd: dish.priceDzd,
      options: [],
      note: "",
    },
  ];
  for (const { code, stars, comment } of reviews) {
    const orderId = demoId("review-order", merchantId, code);
    // Closed, anonymous pickup fixtures create no live events or customer notifications.
    await sql`
      INSERT INTO public.orders (id, quote_id, merchant_id, restaurant_name, short_code, order_day,
        status, fulfilment, version, placed_at, last_event_at, subtotal_dzd, delivery_fee_dzd,
        total_dzd, paying_with_dzd, lines)
      SELECT ${orderId}, ${demoId("review-quote", merchantId, code)}, merchant.id, merchant.restaurant_name,
        ${code}, ${createdAt}::date, 'collected', 'pickup', 4, ${createdAt}, ${createdAt},
        ${dish.priceDzd}, 0, ${dish.priceDzd}, ${dish.priceDzd}, ${JSON.stringify(lines)}::jsonb
      FROM public.merchants AS merchant WHERE merchant.id = ${merchantId} AND merchant.is_demo
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO public.ratings (order_id, food_stars, comment, created_at)
      SELECT purchase.id, ${stars}, ${comment}, ${createdAt}
      FROM public.orders AS purchase WHERE purchase.id = ${orderId}
        AND purchase.merchant_id = ${merchantId} AND purchase.customer_id IS NULL
      ON CONFLICT (order_id) DO NOTHING
    `;
  }
}

export async function seedDemoRestaurants(
  { sql }: DatabaseConnection,
  store: MediaStore,
): Promise<void> {
  // Stage the immutable images first so committed menu rows always point to available bytes.
  const photos = new Map<DemoMenu, { item: DemoPhoto; cover: DemoPhoto }>();
  for (const menu of new Set(demoRestaurants.map(([, , menu]) => menu))) {
    const [item, cover] = await Promise.all([
      publishDemoPhoto(store, menu, "item"),
      publishDemoPhoto(store, menu, "cover"),
    ]);
    photos.set(menu, { item, cover });
  }

  await sql.begin(async (transaction) => {
    await seedDemoOwner(transaction);
    for (const restaurant of demoRestaurants) {
      const menu = restaurant[2];
      const photo = photos.get(menu);
      if (!photo) throw new Error(`Missing demo image for ${menu}.`);
      const merchantId = await seedMerchant(transaction, restaurant);
      const photoId = await seedDemoPhoto(transaction, merchantId, photo.item);
      const coverId = await seedDemoPhoto(transaction, merchantId, photo.cover);
      await transaction`
        UPDATE public.merchants SET cover_photo_id = ${coverId}
        WHERE id = ${merchantId} AND is_demo AND cover_photo_id IS NULL
      `;
      await seedMenu(transaction, merchantId, menuRows(merchantId, menu, photoId));
      await seedReviews(transaction, merchantId, menu);
    }
  });
}
