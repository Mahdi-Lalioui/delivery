import type {
  publicRestaurantItemOutput,
  publicRestaurantItemsOutput,
} from "@zaafran/contracts/restaurant";
import type { TransactionSql } from "postgres";
import type { z } from "zod";
import type { DatabaseConnection } from "./database.js";
import { readCategoryNames, type ItemPage } from "./menu-item-queries.js";
import { readItemOptionGroups } from "./menu-option-group-queries.js";
import { readPageWithLookahead, readVisibleItem } from "./public-restaurant-items.js";
import { readPublicItemPhoto, type RestaurantPhotoQuery } from "./public-restaurant-photo.js";
import { readPublicProfile, readPublicRestaurant } from "./public-restaurant-profile.js";

interface RestaurantRequest {
  readonly slug: string;
  readonly now: Date;
}

interface RestaurantPage
  extends RestaurantRequest, Pick<ItemPage, "categoryId" | "limit" | "cursor"> {}

interface RestaurantDetail extends RestaurantRequest {
  readonly itemId: string;
  readonly expectedRevision: number;
}

type PageResult =
  | ({ readonly kind: "listed" } & z.infer<typeof publicRestaurantItemsOutput>)
  | { readonly kind: "not_found" | "revision_conflict" | "invalid_cursor" };
type DetailResult =
  | ({ readonly kind: "found" } & z.infer<typeof publicRestaurantItemOutput>)
  | { readonly kind: "not_found" | "revision_conflict" };

async function listPublicItems(sql: TransactionSql, request: RestaurantPage): Promise<PageResult> {
  const restaurant = await readPublicRestaurant(sql, request.slug);
  if (!restaurant) return { kind: "not_found" };
  const { merchantId, revision } = restaurant;
  const scope = { ...request, merchantId };
  if (!(await readCategoryNames(sql, scope))) return { kind: "not_found" };
  if (request.cursor && request.cursor.revision !== revision) return { kind: "revision_conflict" };
  if (request.cursor && !(await readVisibleItem(sql, { ...scope, itemId: request.cursor.itemId })))
    return { kind: "invalid_cursor" };
  const visible = await readPageWithLookahead(sql, scope);
  const items = visible.slice(0, request.limit);
  const last = items.at(-1);
  const nextCursor =
    visible.length > request.limit && last ? `${String(revision)}~${last.itemId}` : null;
  return { kind: "listed", revision, items, nextCursor };
}

async function readPublicItem(
  sql: TransactionSql,
  request: RestaurantDetail,
): Promise<DetailResult> {
  const restaurant = await readPublicRestaurant(sql, request.slug);
  if (!restaurant) return { kind: "not_found" };
  if (restaurant.revision !== request.expectedRevision) return { kind: "revision_conflict" };
  const scope = { ...request, merchantId: restaurant.merchantId };
  const item = await readVisibleItem(sql, scope);
  if (!item) return { kind: "not_found" };
  const optionGroups = await readItemOptionGroups(sql, scope);
  return { kind: "found", revision: restaurant.revision, item, optionGroups };
}

export function createPublicRestaurantRepository({ sql }: DatabaseConnection) {
  const isolation = "isolation level repeatable read read only";
  return {
    read: (request: RestaurantRequest) =>
      sql.begin(isolation, (tx) => readPublicProfile(tx, request)),
    list: (request: RestaurantPage) => sql.begin(isolation, (tx) => listPublicItems(tx, request)),
    detail: (request: RestaurantDetail) =>
      sql.begin(isolation, (tx) => readPublicItem(tx, request)),
    readPhoto: (request: RestaurantPhotoQuery) =>
      sql.begin(isolation, (tx) => readPublicItemPhoto(tx, request)),
  };
}
