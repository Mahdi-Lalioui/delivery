import type { TransactionSql } from "postgres";
import type { DatabaseConnection } from "./database.js";
import { readMenuRevision, type MenuScope } from "./menu-access.js";
import {
  runMenuCommand as runCategoryCommand,
  type CommandChange,
  type CommandRequest,
} from "./menu-commands.js";

const categoryLimit = 1_000;
const maximumPosition = 2_147_483_647;

interface CategoryData {
  readonly names: {
    readonly ar?: string | undefined;
    readonly fr?: string | undefined;
    readonly en?: string | undefined;
  };
  readonly availability: { readonly from: string; readonly to: string } | null;
}

interface Category extends CategoryData {
  readonly categoryId: string;
  readonly position: number;
}

interface CategoryCursor {
  readonly revision: number;
  readonly position: number;
  readonly categoryId: string;
}

interface CategoryPage extends MenuScope {
  readonly limit: number;
  readonly cursor?: CategoryCursor | undefined;
}

type CategoryWrite = CommandRequest<CategoryData & { readonly expectedRevision: number }>;
type CategoryRename = CategoryWrite & { readonly categoryId: string };
type CategoryReorder = CommandRequest<{
  readonly categoryIds: readonly string[];
  readonly expectedRevision: number;
}>;

function categoryColumns(sql: TransactionSql) {
  return sql`
    id AS "categoryId", names, sort AS position,
    CASE WHEN available_from IS NULL THEN NULL
      ELSE jsonb_build_object('from', left(available_from::text, 5), 'to', left(available_to::text, 5))
    END AS availability
  `;
}

type CategoryListResult =
  | {
      readonly kind: "listed";
      readonly revision: number;
      readonly categories: Category[];
      readonly nextCursor: string | null;
    }
  | { readonly kind: "not_found" | "revision_conflict" };

async function listCategories(
  sql: TransactionSql,
  request: CategoryPage,
): Promise<CategoryListResult> {
  const revision = await readMenuRevision(sql, request);
  if (revision === undefined) return { kind: "not_found" };
  const { merchantId, limit, cursor } = request;
  if (cursor && cursor.revision !== revision) return { kind: "revision_conflict" };

  const after = cursor
    ? sql`AND (sort, id) > (${cursor.position}::integer, ${cursor.categoryId}::uuid)`
    : sql``;
  const rows = await sql<Category[]>`
    SELECT ${categoryColumns(sql)} FROM public.categories
    WHERE merchant_id = ${merchantId} ${after}
    ORDER BY sort, id LIMIT ${limit + 1}
  `;
  const categories = rows.slice(0, limit);
  const last = categories.at(-1);
  const nextCursor =
    rows.length > limit && last
      ? [revision.toString(), last.position.toString(), last.categoryId].join("~")
      : null;
  return { kind: "listed", revision, categories, nextCursor };
}

async function insertCategory(
  sql: TransactionSql,
  { merchantId, input }: CategoryWrite,
): Promise<CommandChange<{ category: Category }>> {
  const { names, availability } = input;
  const [category] = await sql<Category[]>`
    WITH positions AS (
      SELECT count(*) AS total, coalesce(max(sort)::bigint, -1) + 1 AS next_position
      FROM public.categories WHERE merchant_id = ${merchantId}
    )
    INSERT INTO public.categories (merchant_id, names, sort, available_from, available_to)
    SELECT ${merchantId}::uuid, ${JSON.stringify(names)}::jsonb, next_position::integer,
      ${availability?.from ?? null}::time, ${availability?.to ?? null}::time
    FROM positions WHERE total < ${categoryLimit} AND next_position <= ${maximumPosition}
    RETURNING ${categoryColumns(sql)}
  `;
  return category ? { kind: "changed", value: { category } } : { kind: "category_limit" };
}

async function renameCategory(
  sql: TransactionSql,
  { merchantId, categoryId, input }: CategoryRename,
): Promise<CommandChange<{ category: Category }>> {
  const { names, availability } = input;
  const [category] = await sql<Category[]>`
    UPDATE public.categories SET names = ${JSON.stringify(names)}::jsonb,
      available_from = ${availability?.from ?? null}::time, available_to = ${availability?.to ?? null}::time
    WHERE merchant_id = ${merchantId} AND id = ${categoryId}
    RETURNING ${categoryColumns(sql)}
  `;
  return category ? { kind: "changed", value: { category } } : { kind: "not_found" };
}

async function reorderCategories(
  sql: TransactionSql,
  { merchantId, input }: CategoryReorder,
): Promise<CommandChange<{ categoryIds: string[] }>> {
  const categoryIds = input.categoryIds.map((id) => id.toLowerCase());
  const categories = await sql<{ id: string }[]>`
    SELECT id FROM public.categories WHERE merchant_id = ${merchantId}
  `;
  const requested = new Set(categoryIds);
  if (
    categoryIds.length !== categories.length ||
    requested.size !== categoryIds.length ||
    categories.some(({ id }) => !requested.has(id))
  )
    return { kind: "invalid_order" };

  await sql`SET CONSTRAINTS categories_merchant_sort_key DEFERRED`;
  await sql`
    UPDATE public.categories AS category SET sort = (target.position - 1)::integer
    FROM unnest(${categoryIds}::uuid[]) WITH ORDINALITY AS target(id, position)
    WHERE category.merchant_id = ${merchantId} AND category.id = target.id
  `;
  return { kind: "changed", value: { categoryIds } };
}

export function createMenuCategoryRepository({ sql }: DatabaseConnection) {
  return {
    list: (request: CategoryPage) =>
      sql.begin("isolation level repeatable read read only", (tx) => listCategories(tx, request)),
    create: (request: CategoryWrite) =>
      sql.begin((tx) =>
        runCategoryCommand(tx, request, {
          operation: "category_create",
          apply: () => insertCategory(tx, request),
        }),
      ),
    rename: (request: CategoryRename) =>
      sql.begin((tx) =>
        runCategoryCommand(tx, request, {
          operation: "category_rename",
          apply: () => renameCategory(tx, request),
        }),
      ),
    reorder: (request: CategoryReorder) =>
      sql.begin((tx) =>
        runCategoryCommand(tx, request, {
          operation: "category_reorder",
          apply: () => reorderCategories(tx, request),
        }),
      ),
  };
}
