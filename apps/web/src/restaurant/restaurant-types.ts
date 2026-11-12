import type {
  publicRestaurantItemOutput,
  publicRestaurantItemsOutput,
  publicRestaurantOutput,
} from "@zaafran/contracts/restaurant";
import type { CartNames } from "@zaafran/domain/cart";
import type { Locale } from "@zaafran/i18n/locales";

export type Restaurant = ReturnType<typeof publicRestaurantOutput.parse>;
export type RestaurantItem = ReturnType<typeof publicRestaurantItemOutput.parse>;
export type RestaurantDish = ReturnType<typeof publicRestaurantItemsOutput.parse>["items"][number];
export type RestaurantGroup = RestaurantItem["optionGroups"][number];

export interface DishSelection {
  dish: RestaurantDish;
  revision: number;
  categoryId: string;
}

export function localizeRestaurantText(names: CartNames, locale: Locale): string {
  const preferred = locale === "en-XA" ? "en" : locale;
  return names[preferred] ?? names.fr ?? names.ar ?? names.en ?? "";
}

/** A plain cart line shown as a quantity stepper on its dish card. */
export type Stepper = { lineId: string; quantity: number };
