// Fictional demo restaurants for local development only (AGENTS §11: never in production).
// Names, owners and dishes are invented; phones come from the reserved block in D-022.

interface Text {
  readonly ar: string;
  readonly fr: string;
}

export interface DemoDish {
  readonly names: Text;
  readonly descriptions: Text;
  readonly priceDzd: number;
}

interface DemoCategory {
  readonly names: Text;
  readonly dishes: readonly DemoDish[];
}

export interface DemoMerchant {
  readonly slug: string;
  readonly restaurantName: string;
  readonly ownerName: string;
  readonly communeCode: string;
  readonly cuisines: readonly string[];
  readonly menu: readonly DemoCategory[];
}

function dish(ar: string, fr: string, priceDzd: number): DemoDish {
  return {
    names: { ar, fr },
    descriptions: { ar: `${ar} محضّر في المطبخ يوميًا.`, fr: `${fr} préparé chaque jour.` },
    priceDzd,
  };
}

const algerian: readonly DemoCategory[] = [
  {
    names: { ar: "أطباق تقليدية", fr: "Plats traditionnels" },
    dishes: [
      dish("كسكس بالخضر", "Couscous aux légumes", 900),
      dish("شربة فريك", "Chorba frik", 350),
      dish("رشتة", "Rechta", 800),
    ],
  },
  {
    names: { ar: "مقبلات", fr: "Entrées" },
    dishes: [dish("بوراك", "Bourek", 250), dish("سلطة مشوية", "Salade méchouia", 300)],
  },
];

const grill: readonly DemoCategory[] = [
  {
    names: { ar: "مشاوي", fr: "Grillades" },
    dishes: [
      dish("شواء دجاج", "Brochettes de poulet", 700),
      dish("كفتة", "Kefta grillée", 750),
      dish("مرقاز", "Merguez", 650),
    ],
  },
  {
    names: { ar: "أطباق جانبية", fr: "Accompagnements" },
    dishes: [dish("بطاطا مقلية", "Frites maison", 200), dish("خبز الدار", "Pain maison", 100)],
  },
];

const pizza: readonly DemoCategory[] = [
  {
    names: { ar: "بيتزا", fr: "Pizzas" },
    dishes: [
      dish("بيتزا مارغريتا", "Pizza margherita", 800),
      dish("بيتزا بالتونة", "Pizza au thon", 950),
      dish("بيتزا بالخضر", "Pizza végétarienne", 900),
    ],
  },
  {
    names: { ar: "كالزوني", fr: "Calzones" },
    dishes: [
      dish("كالزوني بالجبن", "Calzone au fromage", 850),
      dish("كالزوني بالدجاج", "Calzone au poulet", 950),
    ],
  },
];

const sandwiches: readonly DemoCategory[] = [
  {
    names: { ar: "سندويشات", fr: "Sandwichs" },
    dishes: [
      dish("كارانتيكا", "Garantita", 150),
      dish("سندويش دجاج", "Sandwich au poulet", 450),
      dish("سندويش كفتة", "Sandwich kefta", 500),
    ],
  },
  {
    names: { ar: "مشروبات", fr: "Boissons" },
    dishes: [dish("عصير برتقال", "Jus d’orange", 250), dish("ليموناضة", "Citronnade", 200)],
  },
];

const seafood: readonly DemoCategory[] = [
  {
    names: { ar: "أسماك", fr: "Poissons" },
    dishes: [
      dish("سردين مشوي", "Sardines grillées", 700),
      dish("طاجين سمك", "Tajine de poisson", 1_200),
      dish("كالامار مقلي", "Calamars frits", 1_100),
    ],
  },
  {
    names: { ar: "شوربات", fr: "Soupes" },
    dishes: [
      dish("شوربة سمك", "Soupe de poisson", 500),
      dish("شوربة عدس", "Soupe de lentilles", 300),
    ],
  },
];

const pastry: readonly DemoCategory[] = [
  {
    names: { ar: "حلويات", fr: "Pâtisseries" },
    dishes: [
      dish("مقروط", "Makroud", 150),
      dish("قلب اللوز", "Qalb el louz", 200),
      dish("بقلاوة", "Baklawa", 250),
    ],
  },
  {
    names: { ar: "مشروبات ساخنة", fr: "Boissons chaudes" },
    dishes: [dish("قهوة", "Café", 100), dish("شاي بالنعناع", "Thé à la menthe", 120)],
  },
];

function merchant(
  slug: string,
  restaurantName: string,
  details: Omit<DemoMerchant, "slug" | "restaurantName">,
): DemoMerchant {
  return { slug: `demo-${slug}`, restaurantName, ...details };
}

export const demoMerchants: readonly DemoMerchant[] = [
  merchant("dar-zitouna", "Dar Zitouna", {
    ownerName: "Samir Fictif",
    communeCode: "1601",
    cuisines: ["algerian"],
    menu: algerian,
  }),
  merchant("el-medina-grill", "El Medina Grill", {
    ownerName: "Nadia Fictive",
    communeCode: "1605",
    cuisines: ["grill"],
    menu: grill,
  }),
  merchant("pizzeria-bahia", "Pizzeria Bahia", {
    ownerName: "Karim Fictif",
    communeCode: "1610",
    cuisines: ["pizza"],
    menu: pizza,
  }),
  merchant("casse-croute-sahel", "Casse-croûte du Sahel", {
    ownerName: "Lina Fictive",
    communeCode: "1618",
    cuisines: ["fast-food"],
    menu: sandwiches,
  }),
  merchant("la-sardine-bleue", "La Sardine bleue", {
    ownerName: "Yacine Fictif",
    communeCode: "1625",
    cuisines: ["seafood"],
    menu: seafood,
  }),
  merchant("patisserie-yasmine", "Pâtisserie Yasmine", {
    ownerName: "Amel Fictive",
    communeCode: "1628",
    cuisines: ["pastry"],
    menu: pastry,
  }),
  merchant("bab-el-djebel", "Bab el Djebel", {
    ownerName: "Rachid Fictif",
    communeCode: "1611",
    cuisines: ["algerian"],
    menu: algerian,
  }),
  merchant("braise-de-ben-aknoun", "Braise de Ben Aknoun", {
    ownerName: "Sonia Fictive",
    communeCode: "1622",
    cuisines: ["grill"],
    menu: grill,
  }),
  merchant("forno-des-pins", "Forno des Pins", {
    ownerName: "Mehdi Fictif",
    communeCode: "1623",
    cuisines: ["pizza"],
    menu: pizza,
  }),
  merchant("snack-des-orangers", "Snack des Orangers", {
    ownerName: "Imane Fictive",
    communeCode: "1642",
    cuisines: ["fast-food"],
    menu: sandwiches,
  }),
  merchant("le-petit-port", "Le Petit Port", {
    ownerName: "Farid Fictif",
    communeCode: "1640",
    cuisines: ["seafood"],
    menu: seafood,
  }),
  merchant("douceurs-cheraga", "Douceurs de Chéraga", {
    ownerName: "Hiba Fictive",
    communeCode: "1650",
    cuisines: ["pastry"],
    menu: pastry,
  }),
];
