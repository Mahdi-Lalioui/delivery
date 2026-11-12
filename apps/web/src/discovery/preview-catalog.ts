import type { publicRestaurantCard } from "@zaafran/contracts/feed";
import type {
  publicRestaurantItemOutput,
  publicRestaurantOutput,
} from "@zaafran/contracts/restaurant";

// Synthetic, fictional restaurants for the team preview and the design loop. Photos are credited
// in docs/PHOTO_CREDITS.md. Nothing here reaches production (isPreviewDemo gates the route).

type RestaurantProfile = ReturnType<typeof publicRestaurantOutput.parse>;
type MenuItemDetail = ReturnType<typeof publicRestaurantItemOutput.parse>;
type MenuOptionGroup = MenuItemDetail["optionGroups"][number];
type Names = RestaurantProfile["categories"][number]["names"];
type FeedExtras = Pick<
  ReturnType<typeof publicRestaurantCard.parse>,
  | "rating"
  | "ratingCount"
  | "etaMinutes"
  | "deliveryFeeDzd"
  | "priceLevel"
  | "acceptsBaridiPay"
  | "acceptsTpe"
  | "isNew"
  | "dietary"
  | "minimumOrderDzd"
  | "offersPickup"
  | "pin"
>;

interface PreviewRestaurant {
  profile: RestaurantProfile;
  feed: FeedExtras;
  menu: MenuItemDetail[];
  /** The category of each menu item, by item ID. */
  categoryOf: ReadonlyMap<string, string>;
}

const revision = 1;

function demoId(id: number) {
  return `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`;
}

const alwaysOpen = {
  weekly: Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    ranges: [{ opensMinute: 0, closesMinute: 1440 }],
  })),
  specialDates: [],
};

interface DishSeed {
  names: Names;
  descriptions: Names;
  priceDzd: number;
  photo: string;
  tags?: MenuItemDetail["item"]["tags"];
  optionGroups?: MenuOptionGroup[];
}

interface RestaurantSeed {
  id: number;
  slug: string;
  name: string;
  cuisines: string[];
  cover: string;
  isOpen?: boolean;
  feed: FeedExtras;
  categories: { names: Names; dishes: DishSeed[] }[];
}

const photos = new Map<string, string>();

function dishDetail(seed: DishSeed, itemId: string, photoId: string): MenuItemDetail {
  return {
    revision,
    item: {
      names: seed.names,
      descriptions: seed.descriptions,
      priceDzd: seed.priceDzd,
      itemId,
      photoId,
      tags: seed.tags ?? [],
      isAvailable: true,
    },
    optionGroups: seed.optionGroups ?? [],
  };
}

function build(seed: RestaurantSeed): PreviewRestaurant {
  const coverMediaId = demoId(seed.id + 500);
  photos.set(coverMediaId, seed.cover);
  const categoryOf = new Map<string, string>();
  const menu: MenuItemDetail[] = [];
  const categories = seed.categories.map(({ names, dishes }, position) => {
    const categoryId = demoId(seed.id + 1 + position * 1000);
    dishes.forEach((dish, index) => {
      const itemId = demoId(seed.id + 2 + position * 1000 + index);
      const photoId = demoId(seed.id + 502 + position * 1000 + index);
      photos.set(photoId, dish.photo);
      categoryOf.set(itemId, categoryId);
      menu.push(dishDetail(dish, itemId, photoId));
    });
    return { categoryId, names, availability: null, position };
  });
  const isOpen = seed.isOpen ?? true;
  return {
    profile: {
      restaurant: {
        slug: seed.slug,
        name: seed.name,
        cuisines: seed.cuisines,
        merchantId: demoId(seed.id),
        communeId: demoId(99),
        coverMediaId,
        logoMediaId: null,
        isOpen,
        nextOpensAt: isOpen ? null : "2026-11-12T10:00:00.000Z",
        pausedUntil: null,
        hours: alwaysOpen,
        ...seed.feed,
      },
      revision,
      categories,
    },
    feed: seed.feed,
    menu,
    categoryOf,
  };
}

function text(fr: string, ar: string, en: string): Names {
  return { fr, ar, en };
}

function option(id: number, names: Names, priceDeltaDzd: number) {
  return { optionId: demoId(id), names, priceDeltaDzd, isAvailable: true, isDefault: false };
}

const size: MenuOptionGroup = {
  optionGroupId: demoId(101),
  names: text("Taille", "الحجم", "Size"),
  minimum: 1,
  maximum: 1,
  options: [
    option(102, text("Classique", "عادي", "Regular"), 0),
    option(103, text("Grande", "كبير", "Large"), 150),
  ],
};

const extras: MenuOptionGroup = {
  optionGroupId: demoId(104),
  names: text("Suppléments", "إضافات", "Extras"),
  minimum: 0,
  maximum: 2,
  options: [
    option(105, text("Fromage", "جبن", "Cheese"), 80),
    option(106, text("Harissa", "هريسة", "Harissa"), 40),
  ],
};

const portion: MenuOptionGroup = {
  optionGroupId: demoId(107),
  names: text("Portion", "الحصة", "Portion"),
  minimum: 1,
  maximum: 1,
  options: [
    option(108, text("Individuelle", "فردية", "Single"), 0),
    option(109, text("Pour deux", "لشخصين", "For two"), 900),
  ],
};

const grill: RestaurantSeed = {
  id: 10,
  slug: "atelier-sidi-yahia",
  name: "L’Atelier Sidi Yahia",
  cuisines: ["grill", "sandwiches"],
  cover: "chawarma",
  feed: {
    pin: { latitude: 36.765, longitude: 3.051 },
    minimumOrderDzd: 800,
    offersPickup: true,
    rating: 4.6,
    ratingCount: 212,
    etaMinutes: { min: 20, max: 30 },
    deliveryFeeDzd: 0,
    priceLevel: 2,
    acceptsBaridiPay: true,
    acceptsTpe: false,
  },
  categories: [
    {
      names: text("Grillades", "مشاوي", "Grill"),
      dishes: [
        {
          names: text("Chawarma maison", "شاورما الدار", "House shawarma"),
          descriptions: text(
            "Poulet grillé, crudités et sauce à l’ail.",
            "دجاج مشوي وخضار طازجة وصلصة الثوم.",
            "Grilled chicken, fresh vegetables and garlic sauce.",
          ),
          priceDzd: 650,
          photo: "chawarma",
          tags: ["popular"],
          optionGroups: [size, extras],
        },
        {
          names: text("Brochettes de poulet", "أسياخ الدجاج", "Chicken skewers"),
          descriptions: text(
            "Brochettes marinées au citron et au cumin.",
            "أسياخ دجاج متبلة بالليمون والكمون.",
            "Chicken skewers marinated in lemon and cumin.",
          ),
          priceDzd: 900,
          photo: "brochettes",
        },
        {
          names: text("Assiette mixte", "طبق مشكل", "Mixed grill plate"),
          descriptions: text(
            "Kefta, brochettes, frites et salade fraîche.",
            "كفتة وأسياخ وبطاطا مقلية وسلطة طازجة.",
            "Kefta, skewers, fries and fresh salad.",
          ),
          priceDzd: 1500,
          photo: "grill-plate",
          optionGroups: [extras],
        },
      ],
    },
    {
      names: text("Sandwichs", "سندويتشات", "Sandwiches"),
      dishes: [
        {
          names: text("Chawarma au poulet", "شاورما دجاج", "Chicken shawarma wrap"),
          descriptions: text(
            "Pain libanais, poulet rôti, cornichons.",
            "خبز لبناني ودجاج مشوي ومخلل.",
            "Flatbread, roast chicken, pickles.",
          ),
          priceDzd: 450,
          photo: "shawarma",
        },
      ],
    },
  ],
};

const pizza: RestaurantSeed = {
  id: 20,
  slug: "four-belcourt",
  name: "Le Four de Belcourt",
  cuisines: ["pizza"],
  cover: "pizza",
  feed: {
    minimumOrderDzd: 1200,
    isNew: true,
    dietary: ["vegetarian"],
    rating: 4.4,
    ratingCount: 87,
    etaMinutes: { min: 30, max: 45 },
    deliveryFeeDzd: 150,
    priceLevel: 2,
    acceptsBaridiPay: false,
    acceptsTpe: true,
  },
  categories: [
    {
      names: text("Pizzas", "بيتزا", "Pizza"),
      dishes: [
        {
          names: text("Pizza poivrons grillés", "بيتزا بالفلفل المشوي", "Roasted pepper pizza"),
          descriptions: text(
            "Tomate, mozzarella et poivrons grillés.",
            "طماطم وموزاريلا وفلفل مشوي.",
            "Tomato, mozzarella and roasted peppers.",
          ),
          priceDzd: 1100,
          photo: "pizza",
        },
      ],
    },
  ],
};

const darYemma: RestaurantSeed = {
  id: 30,
  slug: "dar-yemma",
  name: "Dar Yemma",
  cuisines: ["algerian"],
  cover: "chorba-table",
  feed: {
    pin: { latitude: 36.7395, longitude: 3.087 },
    minimumOrderDzd: 1500,
    offersPickup: true,
    dietary: ["vegetarian"],
    rating: 4.8,
    ratingCount: 431,
    etaMinutes: { min: 25, max: 35 },
    deliveryFeeDzd: 100,
    priceLevel: 2,
    acceptsBaridiPay: true,
    acceptsTpe: true,
  },
  categories: [
    {
      names: text("Plats du jour", "أطباق اليوم", "Today’s dishes"),
      dishes: [
        {
          names: text("Couscous aux légumes", "كسكسي بالخضر", "Vegetable couscous"),
          descriptions: text(
            "Semoule roulée main, pois chiches, courgettes et potiron.",
            "كسكسي مفتول باليد مع الحمص والكوسة والقرع.",
            "Hand-rolled semolina, chickpeas, courgette and pumpkin.",
          ),
          priceDzd: 1200,
          photo: "couscous",
          tags: ["popular", "vegetarian"],
          optionGroups: [portion],
        },
        {
          names: text("Chakhchoukha de Biskra", "شخشوخة بسكرة", "Biskra chakhchoukha"),
          descriptions: text(
            "Galette émiettée, sauce rouge épicée et agneau.",
            "رقاق مفتت مع مرق أحمر حار ولحم الخروف.",
            "Torn flatbread, spiced red sauce and lamb.",
          ),
          priceDzd: 1400,
          photo: "chakhchoukha",
          tags: ["spicy"],
        },
      ],
    },
    {
      names: text("Soupes et entrées", "شوربات ومقبلات", "Soups and starters"),
      dishes: [
        {
          names: text("Chorba frik", "شوربة فريك", "Chorba frik"),
          descriptions: text(
            "Blé vert concassé, agneau, coriandre fraîche.",
            "فريك ولحم الخروف والقصبر الطازج.",
            "Cracked green wheat, lamb, fresh coriander.",
          ),
          priceDzd: 450,
          photo: "chorba",
        },
        {
          names: text("Bourek à la viande", "بوراك باللحم", "Meat bourek"),
          descriptions: text(
            "Feuilles de dioul croustillantes, viande hachée et œuf.",
            "ديول مقرمش باللحم المفروم والبيض.",
            "Crisp dioul pastry, minced meat and egg.",
          ),
          priceDzd: 300,
          photo: "bourek",
        },
      ],
    },
  ],
};

const karantika: RestaurantSeed = {
  id: 40,
  slug: "karantika-bab-el-oued",
  name: "Karantika Bab El Oued",
  cuisines: ["sandwiches"],
  cover: "karantika-sandwich",
  feed: {
    pin: { latitude: 36.7905, longitude: 3.048 },
    minimumOrderDzd: 500,
    offersPickup: true,
    rating: 4.7,
    ratingCount: 958,
    etaMinutes: { min: 10, max: 20 },
    deliveryFeeDzd: 0,
    priceLevel: 1,
    acceptsBaridiPay: false,
    acceptsTpe: false,
  },
  categories: [
    {
      names: text("Karantika", "قرنطيطة", "Karantika"),
      dishes: [
        {
          names: text("Sandwich karantika", "سندويتش قرنطيطة", "Karantika sandwich"),
          descriptions: text(
            "Flan de pois chiches au cumin dans une demi-baguette, harissa.",
            "قرنطيطة بالكمون في نصف خبزة مع الهريسة.",
            "Cumin chickpea flan in half a baguette, harissa.",
          ),
          priceDzd: 150,
          photo: "karantika-sandwich",
          tags: ["popular"],
          optionGroups: [extras],
        },
        {
          names: text("Part de karantika", "قطعة قرنطيطة", "Karantika slice"),
          descriptions: text(
            "Cuite au four à bois, servie chaude.",
            "مطهية في فرن الحطب وتقدم ساخنة.",
            "Baked in a wood oven, served hot.",
          ),
          priceDzd: 80,
          photo: "karantika",
          tags: ["vegetarian"],
        },
      ],
    },
  ],
};

const cirta: RestaurantSeed = {
  id: 50,
  slug: "patisserie-cirta",
  name: "Pâtisserie Cirta",
  cuisines: ["pastry"],
  cover: "baklawa-tray",
  feed: {
    pin: { latitude: 36.7525, longitude: 3.042 },
    minimumOrderDzd: 1000,
    isNew: true,
    offersPickup: true,
    dietary: ["vegetarian"],
    rating: 4.9,
    ratingCount: 326,
    etaMinutes: { min: 30, max: 40 },
    deliveryFeeDzd: 200,
    priceLevel: 3,
    acceptsBaridiPay: true,
    acceptsTpe: true,
  },
  categories: [
    {
      names: text("Gâteaux traditionnels", "حلويات تقليدية", "Traditional sweets"),
      dishes: [
        {
          names: text("Baklawa aux amandes", "بقلاوة باللوز", "Almond baklawa"),
          descriptions: text(
            "Feuilles fines, amandes et miel, par boîte de six.",
            "رقائق رفيعة ولوز وعسل، علبة من ست قطع.",
            "Thin layers, almonds and honey, box of six.",
          ),
          priceDzd: 900,
          photo: "baklawa",
          tags: ["popular"],
        },
        {
          names: text("Plateau de fête", "صينية الأعياد", "Celebration tray"),
          descriptions: text(
            "Assortiment de baklawa, ktaïf et cigares.",
            "تشكيلة من البقلاوة والقطايف والسيقار.",
            "Assorted baklawa, ktaif and cigars.",
          ),
          priceDzd: 3200,
          photo: "baklawa-tray",
        },
      ],
    },
  ],
};

const msemen: RestaurantSeed = {
  id: 60,
  slug: "msemen-wahran",
  name: "Msemen Wahran",
  cuisines: ["bakery"],
  cover: "msemen-griddle",
  feed: {
    minimumOrderDzd: 600,
    isNew: true,
    dietary: ["vegetarian"],
    rating: 4.5,
    ratingCount: 143,
    etaMinutes: { min: 15, max: 25 },
    deliveryFeeDzd: 50,
    priceLevel: 1,
    acceptsBaridiPay: false,
    acceptsTpe: false,
  },
  categories: [
    {
      names: text("Msemen", "مسمن", "Msemen"),
      dishes: [
        {
          names: text("Msemen au miel", "مسمن بالعسل", "Msemen with honey"),
          descriptions: text(
            "Feuilleté à la poêle, beurre et miel de montagne.",
            "مورق على المقلاة بالزبدة وعسل الجبل.",
            "Pan-laminated flatbread, butter and mountain honey.",
          ),
          priceDzd: 150,
          photo: "msemen",
          tags: ["vegetarian"],
        },
        {
          names: text("Msemen farci", "مسمن معمر", "Stuffed msemen"),
          descriptions: text(
            "Oignons, tomate et épices, cuit sur la plaque.",
            "بصل وطماطم وتوابل على الصاج.",
            "Onion, tomato and spices, cooked on the griddle.",
          ),
          priceDzd: 220,
          photo: "msemen-griddle",
          tags: ["new"],
        },
      ],
    },
  ],
};

const bahdja: RestaurantSeed = {
  id: 70,
  slug: "grill-el-bahdja",
  name: "Grill El Bahdja",
  cuisines: ["grill", "algerian"],
  cover: "grill-plate",
  feed: {
    minimumOrderDzd: 2000,
    rating: 4.3,
    ratingCount: 61,
    etaMinutes: { min: 35, max: 50 },
    deliveryFeeDzd: 0,
    priceLevel: 2,
    acceptsBaridiPay: false,
    acceptsTpe: true,
  },
  categories: [
    {
      names: text("Au charbon", "على الفحم", "Charcoal grill"),
      dishes: [
        {
          names: text("Brochettes d’agneau", "أسياخ لحم الخروف", "Lamb skewers"),
          descriptions: text(
            "Six brochettes, frites maison et salade.",
            "ستة أسياخ مع بطاطا مقلية وسلطة.",
            "Six skewers, house fries and salad.",
          ),
          priceDzd: 1300,
          photo: "brochettes",
        },
      ],
    },
  ],
};

const lalla: RestaurantSeed = {
  id: 80,
  slug: "chez-lalla-tlemcen",
  name: "Chez Lalla",
  cuisines: ["algerian", "pastry"],
  cover: "couscous",
  isOpen: false,
  feed: {
    pin: { latitude: 36.729, longitude: 3.069 },
    minimumOrderDzd: 1800,
    offersPickup: true,
    rating: 4.7,
    ratingCount: 204,
    etaMinutes: { min: 40, max: 55 },
    deliveryFeeDzd: 150,
    priceLevel: 3,
    acceptsBaridiPay: true,
    acceptsTpe: false,
  },
  categories: [
    {
      names: text("Spécialités de Tlemcen", "أطباق تلمسانية", "Tlemcen specialities"),
      dishes: [
        {
          names: text("Couscous de Tlemcen", "كسكسي تلمساني", "Tlemcen couscous"),
          descriptions: text(
            "Semoule fine, agneau et légumes du marché.",
            "كسكسي رقيق ولحم الخروف وخضر السوق.",
            "Fine semolina, lamb and market vegetables.",
          ),
          priceDzd: 1500,
          photo: "couscous",
        },
      ],
    },
  ],
};

export const previewCatalog: PreviewRestaurant[] = [
  grill,
  pizza,
  darYemma,
  karantika,
  cirta,
  msemen,
  bahdja,
  lalla,
].map(build);

export const previewPhotos: ReadonlyMap<string, string> = photos;
