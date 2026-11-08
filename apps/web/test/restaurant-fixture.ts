import type { RestaurantItem } from "../src/restaurant/restaurant-types";

export const detail: RestaurantItem = {
  revision: 1,
  item: {
    itemId: "item",
    names: { ar: "شاورما", fr: "Chawarma" },
    descriptions: { fr: "Grillade maison" },
    priceDzd: 400,
    photoId: null,
    tags: [],
    isAvailable: true,
  },
  optionGroups: [
    {
      optionGroupId: "size",
      names: { fr: "Taille" },
      minimum: 1,
      maximum: 1,
      options: [
        {
          optionId: "large",
          names: { fr: "Grande" },
          priceDeltaDzd: 50,
          isAvailable: true,
          isDefault: false,
        },
        {
          optionId: "regular",
          names: { fr: "Classique" },
          priceDeltaDzd: 0,
          isAvailable: true,
          isDefault: false,
        },
      ],
    },
    {
      optionGroupId: "extras",
      names: { fr: "Extras" },
      minimum: 0,
      maximum: 2,
      options: [
        {
          optionId: "cheese",
          names: { fr: "Fromage" },
          priceDeltaDzd: 20,
          isAvailable: true,
          isDefault: true,
        },
        {
          optionId: "sauce",
          names: { fr: "Sauce" },
          priceDeltaDzd: 10,
          isAvailable: true,
          isDefault: false,
        },
        {
          optionId: "soldout",
          names: { fr: "Épuisé" },
          priceDeltaDzd: 10,
          isAvailable: false,
          isDefault: true,
        },
      ],
    },
  ],
};
