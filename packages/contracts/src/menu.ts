import { z } from "zod";
import { pageLimit } from "./pagination.js";

const displayText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !value.includes("\0"));

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

const optionInput = z.strictObject({
  names: name,
  priceDeltaDzd: wholeDzd,
  isDefault: z.boolean(),
  isAvailable: z.boolean(),
});

export const menuOptionGroupInput = z
  .strictObject({
    names: name,
    minimum: z.int().nonnegative(),
    maximum: z.int().positive(),
    options: z.array(optionInput).min(1).max(100),
  })
  .refine(
    ({ minimum, maximum, options }) =>
      minimum <= maximum &&
      maximum <= options.length &&
      options.filter(({ isDefault }) => isDefault).length <= maximum,
    "Choose valid option limits and defaults.",
  );
