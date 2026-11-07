import { z } from "zod";

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

export const menuCategoryOrderInput = z.strictObject({
  categoryIds: z.array(uuid).min(1).max(1000).refine(uniqueIds, "List each category once."),
  expectedRevision: z.int().nonnegative(),
});

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
