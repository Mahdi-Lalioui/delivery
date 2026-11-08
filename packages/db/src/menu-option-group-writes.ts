import type { TransactionSql } from "postgres";
import type { CommandChange, CommandRequest } from "./menu-commands.js";
import {
  readOptionGroup,
  type OptionFields,
  type OptionGroup,
  type OptionGroupFields,
  type OptionGroupTarget,
} from "./menu-option-group-queries.js";

interface GroupCommandInput extends OptionGroupFields {
  readonly expectedRevision: number;
}

interface EditableOption extends OptionFields {
  readonly optionId?: string | undefined;
}

export type GroupCreate = CommandRequest<
  GroupCommandInput & { readonly options: readonly OptionFields[] }
>;
export type GroupUpdate = CommandRequest<
  GroupCommandInput & { readonly options: readonly EditableOption[] }
> &
  OptionGroupTarget;

interface PositionedOption {
  readonly option_id: string | null;
  readonly names: OptionFields["names"];
  readonly price_delta_dzd: number;
  readonly is_default: boolean;
  readonly is_available: boolean;
  readonly sort: number;
}

function positionOptions(options: readonly EditableOption[]): PositionedOption[] {
  return options.map((option, sort) => ({
    option_id: option.optionId?.toLowerCase() ?? null,
    names: option.names,
    price_delta_dzd: option.priceDeltaDzd,
    is_default: option.isDefault,
    is_available: option.isAvailable,
    sort,
  }));
}

function optionRecords(sql: TransactionSql, options: readonly PositionedOption[]) {
  return sql`
    jsonb_to_recordset(${JSON.stringify(options)}::jsonb) AS input(
      option_id uuid, names jsonb, price_delta_dzd integer, is_default boolean,
      is_available boolean, sort smallint
    )
  `;
}

async function insertOptions(
  sql: TransactionSql,
  { merchantId, optionGroupId }: OptionGroupTarget,
  options: readonly PositionedOption[],
): Promise<void> {
  if (options.length === 0) return;
  await sql`
    INSERT INTO public.options (merchant_id, group_id, names, price_delta_dzd, is_default, is_available, sort)
    SELECT ${merchantId}::uuid, ${optionGroupId}::uuid, names, price_delta_dzd, is_default, is_available, sort
    FROM ${optionRecords(sql, options)}
  `;
}

type GroupChange = CommandChange<{ readonly optionGroup: OptionGroup }, "not_found">;

async function changedGroup(sql: TransactionSql, target: OptionGroupTarget): Promise<GroupChange> {
  const optionGroup = await readOptionGroup(sql, target);
  if (!optionGroup) throw new Error("Option group write did not return a group.");
  return { kind: "changed", value: { optionGroup } };
}

export async function createOptionGroup(
  sql: TransactionSql,
  { merchantId, input }: GroupCreate,
): Promise<GroupChange> {
  const [group] = await sql<{ optionGroupId: string }[]>`
    INSERT INTO public.option_groups (merchant_id, names, minimum, maximum)
    VALUES (${merchantId}, ${JSON.stringify(input.names)}::jsonb, ${input.minimum}, ${input.maximum})
    RETURNING id AS "optionGroupId"
  `;
  if (!group) throw new Error("Option group insert returned no row.");
  const target = { merchantId, optionGroupId: group.optionGroupId };
  await insertOptions(sql, target, positionOptions(input.options));
  return changedGroup(sql, target);
}

async function lockGroupOptions(
  sql: TransactionSql,
  { merchantId, optionGroupId }: OptionGroupTarget,
): Promise<Set<string> | undefined> {
  const [group] = await sql`
    SELECT id FROM public.option_groups WHERE merchant_id = ${merchantId} AND id = ${optionGroupId}
    FOR NO KEY UPDATE
  `;
  if (!group) return undefined;
  const options = await sql<{ id: string }[]>`
    SELECT id FROM public.options
    WHERE merchant_id = ${merchantId} AND group_id = ${optionGroupId}
    ORDER BY id FOR UPDATE
  `;
  return new Set(options.map(({ id }) => id));
}

async function replaceOptions(
  sql: TransactionSql,
  { merchantId, optionGroupId }: OptionGroupTarget,
  options: readonly PositionedOption[],
): Promise<void> {
  const retained = options.filter(({ option_id }) => option_id !== null);
  const added = options.filter(({ option_id }) => option_id === null);
  const retainedIds = retained.map(({ option_id }) => option_id);
  await sql`SET CONSTRAINTS options_group_sort_key DEFERRED`;
  await sql`
    DELETE FROM public.options WHERE merchant_id = ${merchantId} AND group_id = ${optionGroupId}
      AND NOT (id = ANY(${retainedIds}::uuid[]))
  `;
  if (retained.length > 0) {
    await sql`
      UPDATE public.options AS option SET names = input.names, price_delta_dzd = input.price_delta_dzd,
        is_default = input.is_default, is_available = input.is_available, sort = input.sort
      FROM ${optionRecords(sql, retained)}
      WHERE option.merchant_id = ${merchantId} AND option.group_id = ${optionGroupId}
        AND option.id = input.option_id
    `;
  }
  await insertOptions(sql, { merchantId, optionGroupId }, added);
}

export async function updateOptionGroup(
  sql: TransactionSql,
  request: GroupUpdate,
): Promise<GroupChange> {
  const { merchantId, optionGroupId, input } = request;
  const existing = await lockGroupOptions(sql, request);
  if (!existing) return { kind: "not_found" };

  const options = positionOptions(input.options);
  const retainedIds = options.flatMap(({ option_id }) => (option_id === null ? [] : [option_id]));
  if (
    new Set(retainedIds).size !== retainedIds.length ||
    retainedIds.some((id) => !existing.has(id))
  )
    return { kind: "not_found" };

  await sql`
    UPDATE public.option_groups SET names = ${JSON.stringify(input.names)}::jsonb,
      minimum = ${input.minimum}, maximum = ${input.maximum}
    WHERE merchant_id = ${merchantId} AND id = ${optionGroupId}
  `;
  await replaceOptions(sql, request, options);
  return changedGroup(sql, request);
}
