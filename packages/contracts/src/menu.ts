import { z } from "zod";
import { pageLimit } from "./pagination.js";

// Unicode mode matches isolated surrogates while allowing valid supplementary characters.
const isolatedSurrogate = /[\uD800-\uDFFF]/u;
const displayText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !value.includes("\0") && !isolatedSurrogate.test(value));

function localizedText(maximum: number) {
  const text = displayText(maximum).optional();
  return z
    .strictObject({ ar: text, fr: text, en: text })
    .refine(({ ar, fr }) => ar !== undefined || fr !== undefined, "Enter Arabic or French text.");
}

const name = localizedText(120);
const uuid = z.uuid();
const wholeDzd = z.int().min(0).max(2_147_483_647);
const tag = z.enum(["spicy", "vegetarian", "new", "popular"]);
const menuRevision = z.int().nonnegative();
const position = z.int().min(0).max(2_147_483_647);
const localTime = z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/);
const uniqueIds = (values: string[]) =>
  new Set(values.map((value) => value.toLowerCase())).size === values.length;
const availabilityWindow = z
  .strictObject({ from: localTime, to: localTime })
  .refine(({ from, to }) => from !== to, "Choose different start and end times.");

export const menuCategoryInput = z.strictObject({
  names: name,
  availability: availabilityWindow.nullable(),
});

const categoryIds = z.array(uuid).min(1).max(1000).refine(uniqueIds, "List each category once.");
const categoryOutput = menuCategoryInput.extend({ categoryId: uuid, position });

export const menuCategoryCommandInput = menuCategoryInput.extend({
  expectedRevision: menuRevision,
});
export const menuCategoryOrderInput = z.strictObject({
  categoryIds,
  expectedRevision: menuRevision,
});
export const menuCategoryOrderOutput = z.strictObject({ categoryIds, revision: menuRevision });
export const menuCategoryWriteOutput = z.strictObject({
  category: categoryOutput,
  revision: menuRevision,
});

const cursorNumber = z
  .string()
  .regex(/^(?:0|[1-9][0-9]*)$/)
  .transform(Number);
const categoryCursorFields = z.strictObject({
  revision: cursorNumber.pipe(menuRevision),
  position: cursorNumber.pipe(position),
  categoryId: uuid,
});

export function readMenuCategoryCursor(cursor: string) {
  const [revision, position, categoryId, extra] = cursor.split("~");
  if (extra !== undefined) return undefined;
  const result = categoryCursorFields.safeParse({ revision, position, categoryId });
  return result.success ? result.data : undefined;
}

const categoryCursor = z
  .string()
  .max(64)
  .refine((cursor) => readMenuCategoryCursor(cursor) !== undefined);

export const menuCategoryPageQuery = z.strictObject({
  limit: pageLimit,
  cursor: categoryCursor.optional(),
});

export const menuCategoryPageOutput = z
  .strictObject({
    sessionId: uuid,
    revision: menuRevision,
    categories: z.array(categoryOutput).max(100),
    nextCursor: categoryCursor.nullable(),
  })
  .refine(
    ({ revision, nextCursor }) =>
      nextCursor === null || readMenuCategoryCursor(nextCursor)?.revision === revision,
  );

export const menuItemInput = z.strictObject({
  categoryId: uuid,
  names: name,
  descriptions: localizedText(1000),
  priceDzd: wholeDzd,
  photoId: uuid.nullable(),
  tags: z
    .array(tag)
    .max(4)
    .refine((values) => new Set(values).size === values.length),
  extraPrepMinutes: z.int().min(0).max(120),
  optionGroupIds: z.array(uuid).max(50).refine(uniqueIds, "Attach each option group once."),
});

export const menuItemRevisionInput = z.strictObject({ expectedRevision: menuRevision });
export const menuItemCommandInput = menuItemInput.extend(menuItemRevisionInput.shape);
export const menuItemAvailabilityInput = menuItemRevisionInput.extend({
  availability: z.enum(["available", "end_of_day", "indefinite"]),
});

const availabilityOutputFields = {
  itemId: uuid,
  isAvailable: z.boolean(),
  soldOutUntil: z.iso.datetime().nullable(),
};

function isValidItemAvailability({
  isAvailable,
  soldOutUntil,
}: {
  isAvailable: boolean;
  soldOutUntil: string | null;
}) {
  return !isAvailable || soldOutUntil === null;
}

export const menuItemAvailabilityOutput = z
  .strictObject({ ...availabilityOutputFields, revision: menuRevision })
  .refine(isValidItemAvailability);

const itemOutput = menuItemInput
  .extend({
    ...availabilityOutputFields,
    moderationStatus: z.enum(["unreviewed", "approved", "blocked_pending_review", "rejected"]),
  })
  .refine(isValidItemAvailability);

export const menuItemWriteOutput = z.strictObject({ item: itemOutput, revision: menuRevision });
export const menuItemArchiveOutput = z.strictObject({
  itemId: uuid,
  archivedAt: z.iso.datetime(),
  revision: menuRevision,
});

const revisionEntityCursorFields = z.strictObject({
  revision: cursorNumber.pipe(menuRevision),
  id: uuid,
});

function readRevisionEntityCursor(cursor: string) {
  const [revision, id, extra] = cursor.split("~");
  if (extra !== undefined) return undefined;
  const result = revisionEntityCursorFields.safeParse({ revision, id });
  return result.success ? result.data : undefined;
}

export function readMenuItemCursor(cursor: string) {
  const parsed = readRevisionEntityCursor(cursor);
  return parsed ? { revision: parsed.revision, itemId: parsed.id } : undefined;
}

const revisionEntityCursor = z
  .string()
  .max(53)
  .refine((cursor) => readRevisionEntityCursor(cursor) !== undefined);

export const menuItemPageQuery = z.strictObject({
  categoryId: uuid,
  limit: pageLimit,
  cursor: revisionEntityCursor.optional(),
});

export const menuItemPageOutput = z
  .strictObject({
    sessionId: uuid,
    revision: menuRevision,
    items: z.array(itemOutput).max(100),
    nextCursor: revisionEntityCursor.nullable(),
  })
  .refine(
    ({ revision, nextCursor }) =>
      nextCursor === null || readMenuItemCursor(nextCursor)?.revision === revision,
  );

const optionInput = z.strictObject({
  names: name,
  priceDeltaDzd: wholeDzd,
  isDefault: z.boolean(),
  isAvailable: z.boolean(),
});

const optionGroupFields = {
  names: name,
  minimum: z.int().nonnegative(),
  maximum: z.int().min(1).max(100),
};

function hasValidSelection({
  minimum,
  maximum,
  options,
}: {
  minimum: number;
  maximum: number;
  options: readonly { isDefault: boolean }[];
}): boolean {
  return (
    minimum <= maximum &&
    maximum <= options.length &&
    options.filter(({ isDefault }) => isDefault).length <= maximum
  );
}

const selectionError = "Choose valid option limits and defaults.";

export const menuOptionGroupInput = z
  .strictObject({ ...optionGroupFields, options: z.array(optionInput).min(1).max(100) })
  .refine(hasValidSelection, selectionError);

export const menuOptionGroupCreateInput = z
  .strictObject({ ...menuOptionGroupInput.shape, expectedRevision: menuRevision })
  .refine(hasValidSelection, selectionError);

const optionWithOptionalId = optionInput.extend({ optionId: uuid.optional() });

export const menuOptionGroupUpdateInput = z
  .strictObject({
    ...optionGroupFields,
    expectedRevision: menuRevision,
    options: z
      .array(optionWithOptionalId)
      .min(1)
      .max(100)
      .refine(
        (options) => uniqueIds(options.flatMap(({ optionId }) => (optionId ? [optionId] : []))),
        "List each existing option once.",
      ),
  })
  .refine(hasValidSelection, selectionError);

const optionGroupSummary = z
  .strictObject({ ...optionGroupFields, optionGroupId: uuid })
  .refine(({ minimum, maximum }) => minimum <= maximum);

const optionGroupDetail = z
  .strictObject({
    ...optionGroupSummary.shape,
    options: z
      .array(optionInput.extend({ optionId: uuid }))
      .min(1)
      .max(100)
      .refine((options) => uniqueIds(options.map(({ optionId }) => optionId))),
  })
  .refine(hasValidSelection, selectionError);

export const menuOptionGroupWriteOutput = z.strictObject({
  revision: menuRevision,
  optionGroup: optionGroupDetail,
});

export const menuOptionGroupDetailOutput = menuOptionGroupWriteOutput.extend({ sessionId: uuid });

export function readMenuOptionGroupCursor(cursor: string) {
  const parsed = readRevisionEntityCursor(cursor);
  return parsed ? { revision: parsed.revision, optionGroupId: parsed.id } : undefined;
}

export const menuOptionGroupPageQuery = z.strictObject({
  limit: pageLimit,
  cursor: revisionEntityCursor.optional(),
});

export const menuOptionGroupPageOutput = z
  .strictObject({
    sessionId: uuid,
    revision: menuRevision,
    optionGroups: z.array(optionGroupSummary).max(100),
    nextCursor: revisionEntityCursor.nullable(),
  })
  .refine(
    ({ revision, nextCursor }) =>
      nextCursor === null || readMenuOptionGroupCursor(nextCursor)?.revision === revision,
  );
