import type {
  publicRestaurantItemOutput,
  publicRestaurantOutput,
} from "@zaafran/contracts/restaurant";

type RestaurantProfile = ReturnType<typeof publicRestaurantOutput.parse>;
type MenuItemDetail = ReturnType<typeof publicRestaurantItemOutput.parse>;
type MenuOptionGroup = MenuItemDetail["optionGroups"][number];
type RestaurantSummary = Pick<RestaurantProfile["restaurant"], "slug" | "name" | "cuisines">;

interface PreviewRestaurant {
  profile: RestaurantProfile;
  menu: MenuItemDetail[];
}

const revision = 1;

function demoId(id: number) {
  return `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`;
}

function restaurant(
  id: number,
  summary: RestaurantSummary,
  categoryNames: RestaurantProfile["categories"][number]["names"],
): RestaurantProfile {
  return {
    restaurant: {
      ...summary,
      merchantId: demoId(id),
      communeId: demoId(99),
      coverMediaId: demoId(id + 500),
      logoMediaId: null,
      isOpen: true,
      nextOpensAt: null,
      pausedUntil: null,
      hours: {
        weekly: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          ranges: [{ opensMinute: 0, closesMinute: 1440 }],
        })),
        specialDates: [],
      },
    },
    revision,
    categories: [
      { categoryId: demoId(id + 1), names: categoryNames, availability: null, position: 0 },
    ],
  };
}

function menuItem(
  id: number,
  content: Pick<MenuItemDetail["item"], "names" | "descriptions" | "priceDzd">,
  optionGroups: MenuItemDetail["optionGroups"] = [],
): MenuItemDetail {
  return {
    revision,
    item: {
      ...content,
      itemId: demoId(id),
      photoId: demoId(id + 500),
      tags: [],
      isAvailable: true,
    },
    optionGroups,
  };
}

const size: MenuOptionGroup = {
  optionGroupId: demoId(101),
  names: { fr: "Taille", ar: "الحجم", en: "Size" },
  minimum: 1,
  maximum: 1,
  options: [
    {
      optionId: demoId(102),
      names: { fr: "Classique", ar: "عادي", en: "Regular" },
      priceDeltaDzd: 0,
      isAvailable: true,
      isDefault: false,
    },
    {
      optionId: demoId(103),
      names: { fr: "Grande", ar: "كبير", en: "Large" },
      priceDeltaDzd: 150,
      isAvailable: true,
      isDefault: false,
    },
  ],
};

const extras: MenuOptionGroup = {
  optionGroupId: demoId(104),
  names: { fr: "Suppléments", ar: "إضافات", en: "Extras" },
  minimum: 0,
  maximum: 2,
  options: [
    {
      optionId: demoId(105),
      names: { fr: "Fromage", ar: "جبن", en: "Cheese" },
      priceDeltaDzd: 80,
      isAvailable: true,
      isDefault: false,
    },
    {
      optionId: demoId(106),
      names: { fr: "Harissa", ar: "هريسة", en: "Harissa" },
      priceDeltaDzd: 40,
      isAvailable: true,
      isDefault: false,
    },
  ],
};

export const previewCatalog: PreviewRestaurant[] = [
  {
    profile: restaurant(
      10,
      { slug: "atelier-demo", name: "L’Atelier Démo", cuisines: ["grill", "sandwiches"] },
      { fr: "Grillades", ar: "مشاوي", en: "Grill" },
    ),
    menu: [
      menuItem(
        12,
        {
          names: { fr: "Chawarma maison", ar: "شاورما الدار", en: "House shawarma" },
          descriptions: {
            fr: "Poulet grillé, crudités et sauce à l’ail.",
            ar: "دجاج مشوي وخضار طازجة وصلصة الثوم.",
            en: "Grilled chicken, fresh vegetables and garlic sauce.",
          },
          priceDzd: 650,
        },
        [size, extras],
      ),
      menuItem(13, {
        names: { fr: "Brochettes de poulet", ar: "أسياخ الدجاج", en: "Chicken skewers" },
        descriptions: {
          fr: "Brochettes marinées au citron et au cumin.",
          ar: "أسياخ دجاج متبلة بالليمون والكمون.",
          en: "Chicken skewers marinated in lemon and cumin.",
        },
        priceDzd: 900,
      }),
    ],
  },
  {
    profile: restaurant(
      20,
      { slug: "four-demo", name: "Le Four Démo", cuisines: ["pizza"] },
      { fr: "Pizzas", ar: "بيتزا", en: "Pizza" },
    ),
    menu: [
      menuItem(22, {
        names: {
          fr: "Pizza poivrons grillés",
          ar: "بيتزا بالفلفل المشوي",
          en: "Roasted pepper pizza",
        },
        descriptions: {
          fr: "Tomate, mozzarella et poivrons grillés.",
          ar: "طماطم وموزاريلا وفلفل مشوي.",
          en: "Tomato, mozzarella and roasted peppers.",
        },
        priceDzd: 1100,
      }),
    ],
  },
];

export const previewPhotos = new Map([
  [demoId(510), "chawarma"],
  [demoId(520), "pizza"],
  [demoId(512), "chawarma"],
  [demoId(513), "brochettes"],
  [demoId(522), "pizza"],
]);
