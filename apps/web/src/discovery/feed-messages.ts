import type { Locale } from "@zaafran/i18n/locales";

const en = {
  eyebrow: "Dining in Algiers",
  heading: "All restaurants",
  loading: "Loading restaurants…",
  loadMore: "Load more restaurants",
  loadingMore: "Loading more restaurants…",
  retry: "Try again",
  empty: "No restaurants to show yet.",
  error: "We couldn’t load the restaurants. Please try again.",
  pageError: "We couldn’t load more restaurants. Please try again.",
  open: "Open now",
  closed: "Closed",
  opensAt: "Opens",
  openingTimeSeparator: " · ",
  otherCuisine: "Other cuisine",
  cuisines: {
    algerian: "Algerian",
    bakery: "Bakery",
    grill: "Grill",
    pizza: "Pizza",
    seafood: "Seafood",
    "fried-chicken": "Fried chicken",
    sandwiches: "Sandwiches",
    pastry: "Pastry",
    healthy: "Healthy",
  },
};

const messages = {
  en,
  "en-XA": en,
  fr: {
    eyebrow: "À table à Alger",
    heading: "Tous les restaurants",
    loading: "Chargement des restaurants…",
    loadMore: "Voir plus de restaurants",
    loadingMore: "Chargement des restaurants suivants…",
    retry: "Réessayer",
    empty: "Aucun restaurant à afficher pour le moment.",
    error: "Impossible de charger les restaurants. Veuillez réessayer.",
    pageError: "Impossible de charger les restaurants suivants. Veuillez réessayer.",
    open: "Ouvert",
    closed: "Fermé",
    opensAt: "Ouvre le",
    openingTimeSeparator: " · ",
    otherCuisine: "Autre cuisine",
    cuisines: {
      algerian: "Cuisine algérienne",
      bakery: "Boulangerie",
      grill: "Grillades",
      pizza: "Pizzas",
      seafood: "Poissons et fruits de mer",
      "fried-chicken": "Poulet frit",
      sandwiches: "Sandwichs",
      pastry: "Pâtisseries",
      healthy: "Cuisine saine",
    },
  },
  ar: {
    eyebrow: "على مائدة الجزائر العاصمة",
    heading: "كل المطاعم",
    loading: "جارٍ تحميل المطاعم…",
    loadMore: "عرض المزيد من المطاعم",
    loadingMore: "جارٍ تحميل المزيد من المطاعم…",
    retry: "إعادة المحاولة",
    empty: "لا توجد مطاعم لعرضها حاليًا.",
    error: "تعذّر تحميل المطاعم. يرجى إعادة المحاولة.",
    pageError: "تعذّر تحميل المزيد من المطاعم. يرجى إعادة المحاولة.",
    open: "مفتوح الآن",
    closed: "مغلق",
    opensAt: "يفتح في",
    openingTimeSeparator: " · ",
    otherCuisine: "مأكولات أخرى",
    cuisines: {
      algerian: "مأكولات جزائرية",
      bakery: "مخبوزات",
      grill: "مشاوي",
      pizza: "بيتزا",
      seafood: "أسماك ومأكولات بحرية",
      "fried-chicken": "دجاج مقلي",
      sandwiches: "شطائر",
      pastry: "حلويات",
      healthy: "مأكولات صحية",
    },
  },
} satisfies Record<Locale, typeof en>;

export function getFeedMessages(locale: Locale) {
  return messages[locale];
}

export function getFeedCuisineLabel(locale: Locale, cuisine: string) {
  const { cuisines, otherCuisine } = getFeedMessages(locale);
  return Object.entries(cuisines).find(([code]) => code === cuisine)?.[1] ?? otherCuisine;
}
