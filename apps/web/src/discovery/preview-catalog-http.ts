import {
  publicFeedOutput,
  publicFeedQuery,
  publicProfilePhotoParams,
} from "@zaafran/contracts/feed";
import { readMenuItemCursor } from "@zaafran/contracts/menu";
import {
  publicRestaurantCategoryParams,
  publicRestaurantItemOutput,
  publicRestaurantItemParams,
  publicRestaurantItemQuery,
  publicRestaurantItemsOutput,
  publicRestaurantItemsQuery,
  publicRestaurantOutput,
  publicRestaurantParams,
} from "@zaafran/contracts/restaurant";
import { publicSearchOutput, publicSearchQuery } from "@zaafran/contracts/search";
import { normalize } from "@zaafran/domain/search";
import synonyms from "@zaafran/i18n/search-synonyms" with { type: "json" };
import { isPreviewDemo } from "../preview-settings";
import { previewCatalog, previewPhotos } from "./preview-catalog";

const noStore = { "cache-control": "no-store" };
const problems = {
  400: { code: "invalid_request", title: "Invalid request" },
  404: { code: "not_found", title: "Not found" },
  405: { code: "method_not_allowed", title: "Method not allowed" },
  409: { code: "revision_conflict", title: "Menu revision conflict" },
};

function problem(status: keyof typeof problems) {
  return Response.json(
    { type: "about:blank", status, requestId: crypto.randomUUID(), ...problems[status] },
    {
      status,
      headers: {
        ...noStore,
        "content-type": "application/problem+json",
        ...(status === 405 ? { allow: "GET" } : {}),
      },
    },
  );
}

function json(value: unknown) {
  return Response.json(value, { headers: noStore });
}

function parseQuery(params: URLSearchParams) {
  const query = new Map<string, string | string[]>();
  for (const [key, value] of params) {
    query.set(key, query.has(key) ? [] : value);
  }
  return Object.fromEntries(query);
}

const cards = previewCatalog.map(({ profile: { restaurant }, feed }) => {
  const {
    merchantId,
    slug,
    name,
    cuisines,
    communeId,
    coverMediaId,
    logoMediaId,
    isOpen,
    nextOpensAt,
  } = restaurant;
  return {
    merchantId,
    slug,
    name,
    cuisines,
    communeId,
    coverMediaId,
    logoMediaId,
    isOpen,
    nextOpensAt,
    ...feed,
  };
});

type FeedQuery = ReturnType<typeof publicFeedQuery.parse>;
type Card = (typeof cards)[number];

const filterChecks: ((card: Card, query: FeedQuery) => boolean)[] = [
  (card, { cuisine }) => cuisine === undefined || card.cuisines.includes(cuisine),
  (card, { openNow }) => openNow !== true || card.isOpen,
  (card, { freeDelivery }) => freeDelivery !== true || card.deliveryFeeDzd === 0,
  (card, { minRating }) => minRating === undefined || (card.rating ?? 0) >= minRating,
  (card, { priceLevel }) => priceLevel === undefined || card.priceLevel === priceLevel,
  (card, { acceptsBaridiPay }) => acceptsBaridiPay !== true || card.acceptsBaridiPay === true,
  (card, { acceptsTpe }) => acceptsTpe !== true || card.acceptsTpe === true,
  (card, { dietary }) => dietary === undefined || (card.dietary ?? []).includes(dietary),
  (card, { newOnly }) => newOnly !== true || card.isNew === true,
  (card, { fulfilment }) => fulfilment !== "pickup" || card.offersPickup === true,
  (card, { maxMinimumOrderDzd: most }) =>
    most === undefined || (card.minimumOrderDzd ?? Infinity) <= most,
  (card, { maxEtaMinutes }) =>
    maxEtaMinutes === undefined || (card.etaMinutes?.max ?? Infinity) <= maxEtaMinutes,
];

function matchesFilters(card: Card, query: FeedQuery) {
  return filterChecks.every((check) => check(card, query));
}

const sorters: Record<string, (left: Card, right: Card) => number> = {
  rating: (left, right) => (right.rating ?? 0) - (left.rating ?? 0),
  eta: (left, right) => (left.etaMinutes?.max ?? 999) - (right.etaMinutes?.max ?? 999),
  fee: (left, right) =>
    (left.deliveryFeeDzd ?? Number.MAX_SAFE_INTEGER) -
    (right.deliveryFeeDzd ?? Number.MAX_SAFE_INTEGER),
};

function countOf(cards: readonly Card[], isWanted: boolean | undefined) {
  return isWanted === true ? { totalCount: cards.length } : {};
}

function feed(params: URLSearchParams) {
  const query = publicFeedQuery.safeParse(parseQuery(params));
  if (!query.success) return problem(400);
  const { cursor, limit, sort, includeCount } = query.data;
  const sorter = sort === undefined ? undefined : sorters[sort];
  const matching = cards.filter((card) => matchesFilters(card, query.data));
  const ordered = sorter === undefined ? matching : matching.toSorted(sorter);
  const cursorIndex = cursor ? ordered.findIndex(({ merchantId }) => merchantId === cursor) : -1;
  if (cursor && cursorIndex === -1) return problem(400);

  const start = cursorIndex + 1;
  const restaurants = ordered.slice(start, start + limit);
  const nextCursor =
    start + limit < ordered.length ? (restaurants.at(-1)?.merchantId ?? null) : null;
  return json(
    publicFeedOutput.parse({ restaurants, nextCursor, ...countOf(ordered, includeCount) }),
  );
}

const aliasGroups = Object.values(synonyms).map((terms) => terms.map(normalize));

function matchesSearch(variants: readonly string[], fields: readonly (string | undefined)[]) {
  return fields.some((field) => {
    const value = normalize(field ?? "");
    return variants.some((variant) => value.includes(variant));
  });
}

function search(params: URLSearchParams) {
  const query = publicSearchQuery.safeParse(parseQuery(params));
  if (!query.success) return problem(400);
  const { q, limit } = query.data;
  const normalized = normalize(q);
  if (!normalized) return json({ restaurants: [], dishes: [] });
  const variants = aliasGroups.find((group) => group.includes(normalized)) ?? [normalized];

  const restaurants = cards
    .filter(({ name, cuisines }) => matchesSearch(variants, [name, ...cuisines]))
    .slice(0, limit)
    .map(({ merchantId, slug, name, coverMediaId }) => ({ merchantId, slug, name, coverMediaId }));
  const dishes = previewCatalog
    .flatMap(({ profile: { restaurant }, menu }) =>
      menu.map(({ item }) => ({
        itemId: item.itemId,
        names: item.names,
        priceDzd: item.priceDzd,
        merchantId: restaurant.merchantId,
        merchantName: restaurant.name,
        merchantSlug: restaurant.slug,
        photoMediaId: item.photoId,
      })),
    )
    .filter(({ names }) => matchesSearch(variants, Object.values(names)))
    .slice(0, limit);
  return json(publicSearchOutput.parse({ restaurants, dishes }));
}

function profile(slug: string) {
  if (!publicRestaurantParams.safeParse({ slug }).success) return problem(400);
  const entry = previewCatalog.find(({ profile }) => profile.restaurant.slug === slug);
  return entry ? json(publicRestaurantOutput.parse(entry.profile)) : problem(404);
}

function category(match: { slug: string; categoryId: string }, params: URLSearchParams) {
  const query = publicRestaurantItemsQuery.safeParse(parseQuery(params));
  if (!publicRestaurantCategoryParams.safeParse(match).success || !query.success) {
    return problem(400);
  }

  const entry = previewCatalog.find(({ profile }) => profile.restaurant.slug === match.slug);
  const categoryId = match.categoryId.toLowerCase();
  if (!entry?.profile.categories.some((category) => category.categoryId === categoryId)) {
    return problem(404);
  }

  return categoryPage(entry, categoryId, query.data);
}

function categoryPage(
  { profile: { revision }, menu: fullMenu, categoryOf }: (typeof previewCatalog)[number],
  categoryId: string,
  { cursor, limit }: ReturnType<typeof publicRestaurantItemsQuery.parse>,
) {
  const menu = fullMenu.filter(({ item }) => categoryOf.get(item.itemId) === categoryId);
  const position = cursor ? readMenuItemCursor(cursor) : undefined;
  if (position && position.revision !== revision) return problem(409);
  const cursorIndex = position
    ? menu.findIndex(({ item }) => item.itemId === position.itemId.toLowerCase())
    : -1;
  if (position && cursorIndex === -1) return problem(409);

  const start = cursorIndex + 1;
  const items = menu.slice(start, start + limit).map(({ item }) => item);
  const last = items.at(-1);
  const nextCursor =
    last && start + limit < menu.length ? `${String(revision)}~${last.itemId}` : null;
  return json(publicRestaurantItemsOutput.parse({ revision, items, nextCursor }));
}

function item(match: { slug: string; itemId: string }, params: URLSearchParams) {
  const query = publicRestaurantItemQuery.safeParse(parseQuery(params));
  if (!publicRestaurantItemParams.safeParse(match).success || !query.success) return problem(400);

  const entry = previewCatalog.find(({ profile }) => profile.restaurant.slug === match.slug);
  const itemId = match.itemId.toLowerCase();
  const detail = entry?.menu.find(({ item }) => item.itemId === itemId);
  if (!detail) return problem(404);
  if (query.data.expectedRevision !== detail.revision) return problem(409);
  return json(publicRestaurantItemOutput.parse(detail));
}

export function readPreviewCatalog(request: Request) {
  if (!isPreviewDemo(process.env)) return problem(404);
  if (request.method !== "GET") return problem(405);

  return dispatch(new URL(request.url));
}

function dispatch({ pathname, searchParams }: URL) {
  if (pathname === "/v1/feed") return feed(searchParams);
  if (pathname === "/v1/search") return search(searchParams);

  return photoRoute(pathname) ?? restaurantRoute(pathname, searchParams);
}

function photoRoute(pathname: string) {
  const pattern =
    /^\/v1\/merchants\/([^/]+)\/(?:profile|items\/([^/]+))\/photos\/([^/]+)\/variants\/([^/]+)\/([^/]+)$/u;
  const match = pattern.exec(pathname);
  if (!match) return undefined;

  const [, merchantId, itemId, mediaId, format, width] = match;
  const parsed = publicProfilePhotoParams.safeParse({ merchantId, mediaId, format, width });
  if (!parsed.success) return problem(400);

  const entry = previewCatalog.find(({ profile }) => profile.restaurant.merchantId === merchantId);
  const photoId = itemId
    ? entry?.menu.find(({ item }) => item.itemId === itemId)?.item.photoId
    : entry?.profile.restaurant.coverMediaId;
  const name = photoId === parsed.data.mediaId ? previewPhotos.get(photoId) : undefined;
  if (!name) return problem(404);
  const variantWidth = parsed.data.width;
  const suffix = variantWidth === 1280 ? "" : "-" + String(Math.max(320, variantWidth));
  const location = `/preview-catalog/${name}${suffix}.webp`;
  return new Response(null, { status: 307, headers: { ...noStore, location } });
}

function restaurantRoute(pathname: string, searchParams: URLSearchParams) {
  const categoryMatch = /^\/v1\/merchants\/([^/]+)\/categories\/([^/]+)\/items$/u.exec(pathname);
  const [, categorySlug, categoryId] = categoryMatch ?? [];
  if (categorySlug && categoryId) return category({ slug: categorySlug, categoryId }, searchParams);

  const itemMatch = /^\/v1\/merchants\/([^/]+)\/items\/([^/]+)$/u.exec(pathname);
  const [, itemSlug, itemId] = itemMatch ?? [];
  if (itemSlug && itemId) return item({ slug: itemSlug, itemId }, searchParams);

  const [, slug] = /^\/v1\/merchants\/([^/]+)$/u.exec(pathname) ?? [];
  return slug ? profile(slug) : problem(404);
}
