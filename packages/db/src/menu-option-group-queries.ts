import type { TransactionSql } from "postgres";
import { readMenuContext, type MenuScope } from "./menu-access.js";
import type { ItemTarget } from "./menu-item-queries.js";

interface Translations {
  readonly ar?: string | undefined;
  readonly fr?: string | undefined;
  readonly en?: string | undefined;
}

export interface OptionFields {
  readonly names: Translations;
  readonly priceDeltaDzd: number;
  readonly isDefault: boolean;
  readonly isAvailable: boolean;
}

export interface OptionGroupFields {
  readonly names: Translations;
  readonly minimum: number;
  readonly maximum: number;
}

interface OptionGroupSummary extends OptionGroupFields {
  readonly optionGroupId: string;
}

export interface OptionGroup extends OptionGroupSummary {
  readonly options: (OptionFields & { readonly optionId: string })[];
}

export interface OptionGroupTarget {
  readonly merchantId: string;
  readonly optionGroupId: string;
}

export type OptionGroupDetailScope = MenuScope & OptionGroupTarget;

interface GroupCursor {
  readonly revision: number;
  readonly optionGroupId: string;
}

export interface OptionGroupPage extends MenuScope {
  readonly limit: number;
  readonly cursor?: GroupCursor | undefined;
}

function optionGroupColumns(sql: TransactionSql) {
  return sql`groups.id AS "optionGroupId", groups.names, groups.minimum, groups.maximum,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'optionId', option.id, 'names', option.names, 'priceDeltaDzd', option.price_delta_dzd,
          'isDefault', option.is_default, 'isAvailable', option.is_available
        ) ORDER BY option.sort)
        FROM public.options AS option
        WHERE option.merchant_id = groups.merchant_id AND option.group_id = groups.id
      ) AS options
  `;
}

export async function readOptionGroup(
  sql: TransactionSql,
  { merchantId, optionGroupId }: OptionGroupTarget,
): Promise<OptionGroup | undefined> {
  const [group] = await sql<OptionGroup[]>`
    SELECT ${optionGroupColumns(sql)}
    FROM public.option_groups AS groups
    WHERE groups.merchant_id = ${merchantId} AND groups.id = ${optionGroupId}
  `;
  return group;
}

export async function readItemOptionGroups(
  sql: TransactionSql,
  { merchantId, itemId }: ItemTarget,
): Promise<OptionGroup[]> {
  return sql<OptionGroup[]>`
    SELECT ${optionGroupColumns(sql)}
    FROM public.item_option_groups AS attachment
    JOIN public.option_groups AS groups
      ON groups.merchant_id = attachment.merchant_id AND groups.id = attachment.group_id
    WHERE attachment.merchant_id = ${merchantId} AND attachment.item_id = ${itemId}
    ORDER BY attachment.sort
  `;
}

type GroupDetailResult =
  | { readonly kind: "found"; readonly revision: number; readonly optionGroup: OptionGroup }
  | { readonly kind: "not_found" };

export async function getOptionGroupDetail(
  sql: TransactionSql,
  scope: OptionGroupDetailScope,
): Promise<GroupDetailResult> {
  const menu = await readMenuContext(sql, scope);
  if (!menu) return { kind: "not_found" };
  const optionGroup = await readOptionGroup(sql, scope);
  return optionGroup
    ? { kind: "found", revision: menu.revision, optionGroup }
    : { kind: "not_found" };
}

async function hasCursorAnchor(
  sql: TransactionSql,
  { merchantId, optionGroupId }: OptionGroupTarget,
): Promise<boolean> {
  const [group] = await sql`
    SELECT id FROM public.option_groups WHERE merchant_id = ${merchantId} AND id = ${optionGroupId}
  `;
  return group !== undefined;
}

type GroupListResult =
  | {
      readonly kind: "listed";
      readonly revision: number;
      readonly optionGroups: OptionGroupSummary[];
      readonly nextCursor: string | null;
      readonly context: { readonly restaurantName: string };
    }
  | { readonly kind: "not_found" | "revision_conflict" | "invalid_cursor" };

export async function listOptionGroups(
  sql: TransactionSql,
  request: OptionGroupPage,
): Promise<GroupListResult> {
  const menu = await readMenuContext(sql, request);
  if (!menu) return { kind: "not_found" };
  const { revision, restaurantName } = menu;
  const { merchantId, limit, cursor } = request;
  if (cursor && cursor.revision !== revision) return { kind: "revision_conflict" };
  if (cursor && !(await hasCursorAnchor(sql, { merchantId, optionGroupId: cursor.optionGroupId })))
    return { kind: "invalid_cursor" };

  const after = cursor ? sql`AND id > ${cursor.optionGroupId}` : sql``;
  const rows = await sql<OptionGroupSummary[]>`
    SELECT id AS "optionGroupId", names, minimum, maximum FROM public.option_groups
    WHERE merchant_id = ${merchantId} ${after}
    ORDER BY id LIMIT ${limit + 1}
  `;
  const optionGroups = rows.slice(0, limit);
  const last = optionGroups.at(-1);
  const nextCursor =
    rows.length > limit && last ? revision.toString() + "~" + last.optionGroupId : null;
  return { kind: "listed", revision, optionGroups, nextCursor, context: { restaurantName } };
}
