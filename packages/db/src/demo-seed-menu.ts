interface DemoText {
  readonly ar: string;
  readonly fr: string;
}

interface DemoDish {
  readonly key: string;
  readonly names: DemoText;
  readonly descriptions: DemoText;
  readonly priceDzd: number;
}

const sweets = {
  key: "sweets",
  names: { ar: "الحلويات والمشروبات", fr: "Douceurs et boissons" },
  dishes: [
    {
      key: "orange-cake",
      names: { ar: "كعكة البرتقال", fr: "Gâteau à l’orange" },
      descriptions: { ar: "كعكة طرية بقشر البرتقال", fr: "Gâteau moelleux au zeste d’orange" },
      priceDzd: 260,
    },
    {
      key: "mint-lemonade",
      names: { ar: "ليمونادة بالنعناع", fr: "Citronnade à la menthe" },
      descriptions: { ar: "ليمون طازج وأوراق نعناع", fr: "Citron pressé et feuilles de menthe" },
      priceDzd: 220,
    },
  ],
};

const main = { key: "main", names: { ar: "الأطباق", fr: "Les plats" } };

export const demoMenus = {
  algerian: [
    {
      ...main,
      dishes: [
        {
          key: "couscous",
          names: { ar: "كسكس بالخضار", fr: "Couscous aux légumes" },
          descriptions: {
            ar: "سميد مع حمص وخضار موسمية",
            fr: "Semoule, pois chiches et légumes de saison",
          },
          priceDzd: 890,
        },
        {
          key: "chorba",
          names: { ar: "شوربة فريك", fr: "Chorba frik" },
          descriptions: {
            ar: "شوربة قمح أخضر بالطماطم والكزبرة",
            fr: "Soupe de blé vert à la tomate et à la coriandre",
          },
          priceDzd: 450,
        },
        {
          key: "bourek",
          names: { ar: "بوراك بالبطاطا", fr: "Bourek aux pommes de terre" },
          descriptions: {
            ar: "ورقة مقرمشة محشوة بالبطاطا والبقدونس",
            fr: "Feuille croustillante, pomme de terre et persil",
          },
          priceDzd: 350,
        },
      ],
    },
    sweets,
  ],
  pizza: [
    {
      ...main,
      dishes: [
        {
          key: "garden-pizza",
          names: { ar: "بيتزا الحديقة", fr: "Pizza du jardin" },
          descriptions: {
            ar: "عجينة رقيقة بالفلفل المشوي والريحان",
            fr: "Pâte fine, poivrons grillés et basilic",
          },
          priceDzd: 1_100,
        },
        {
          key: "olive-pizza",
          names: { ar: "بيتزا الزيتون", fr: "Pizza aux olives" },
          descriptions: {
            ar: "طماطم وزيتون أسود وموزاريلا",
            fr: "Tomate, olives noires et mozzarella",
          },
          priceDzd: 940,
        },
        {
          key: "folded-pizza",
          names: { ar: "بيتزا مطوية بالسبانخ", fr: "Chausson aux épinards" },
          descriptions: {
            ar: "عجينة مخبوزة بالسبانخ والجبن",
            fr: "Pâte au four garnie d’épinards et de fromage",
          },
          priceDzd: 740,
        },
      ],
    },
    sweets,
  ],
  grill: [
    {
      ...main,
      dishes: [
        {
          key: "chicken-skewers",
          names: { ar: "أسياخ الدجاج بالليمون", fr: "Brochettes de poulet citronné" },
          descriptions: {
            ar: "دجاج مشوي مع أرز وأعشاب",
            fr: "Poulet grillé, riz et herbes fraîches",
          },
          priceDzd: 1_250,
        },
        {
          key: "vegetable-skewers",
          names: { ar: "أسياخ الخضار", fr: "Brochettes de légumes" },
          descriptions: { ar: "كوسة وفلفل وبصل مشوي", fr: "Courgette, poivron et oignon grillés" },
          priceDzd: 810,
        },
        {
          key: "pepper-salad",
          names: { ar: "سلطة الفلفل المشوي", fr: "Salade de poivrons grillés" },
          descriptions: {
            ar: "فلفل محمر مع زيت الزيتون والثوم",
            fr: "Poivrons rôtis, huile d’olive et ail",
          },
          priceDzd: 420,
        },
      ],
    },
    sweets,
  ],
  bakery: [
    {
      ...main,
      dishes: [
        {
          key: "flatbread",
          names: { ar: "خبز مسطح بالخضار", fr: "Galette aux légumes" },
          descriptions: {
            ar: "خبز ساخن محشو بالباذنجان والفلفل",
            fr: "Galette chaude, aubergine et poivron",
          },
          priceDzd: 620,
        },
        {
          key: "honey-pancake",
          names: { ar: "بغرير بالعسل", fr: "Baghrir au miel" },
          descriptions: {
            ar: "فطائر السميد مع العسل",
            fr: "Crêpes de semoule servies avec du miel",
          },
          priceDzd: 460,
        },
        {
          key: "date-cookie",
          names: { ar: "مقروط بالتمر", fr: "Makrout aux dattes" },
          descriptions: {
            ar: "حلوى سميد محشوة بمعجون التمر",
            fr: "Losanges de semoule fourrés aux dattes",
          },
          priceDzd: 380,
        },
      ],
    },
    sweets,
  ],
} satisfies Record<
  string,
  readonly { key: string; names: DemoText; dishes: readonly DemoDish[] }[]
>;

export type DemoMenu = keyof typeof demoMenus;

export const demoRestaurants = [
  ["lune-de-semoule", "1601", "algerian", { ar: "قمر السميد", fr: "Lune de Semoule" }],
  ["ficelle-du-four", "1602", "pizza", { ar: "خيط الفرن", fr: "Ficelle du Four" }],
  ["braise-de-sauge", "1604", "grill", { ar: "جمر الميرمية", fr: "Braise de Sauge" }],
  ["mie-des-figues", "1605", "bakery", { ar: "لب التين", fr: "Mie des Figues" }],
  ["bol-de-cardamome", "1607", "algerian", { ar: "وعاء الهيل", fr: "Bol de Cardamome" }],
  ["basilic-d-ambre", "1610", "pizza", { ar: "ريحان العنبر", fr: "Basilic d’Ambre" }],
  ["broche-d-argile", "1611", "grill", { ar: "سيخ الطين", fr: "Broche d’Argile" }],
  ["galette-du-lotus", "1618", "bakery", { ar: "فطيرة اللوتس", fr: "Galette du Lotus" }],
  ["marmite-d-azur", "1621", "algerian", { ar: "قدر اللازورد", fr: "Marmite d’Azur" }],
  ["tomate-des-dunes", "1622", "pizza", { ar: "طماطم الكثبان", fr: "Tomate des Dunes" }],
  ["gril-du-jasmin", "1628", "grill", { ar: "شواية الياسمين", fr: "Gril du Jasmin" }],
  ["croissant-de-rose", "1630", "bakery", { ar: "هلال الورد", fr: "Croissant de Rose" }],
] as const satisfies readonly (readonly [string, string, DemoMenu, DemoText])[];
