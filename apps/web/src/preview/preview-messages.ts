import type { PublicLocale } from "@zaafran/i18n/locales";

type PreviewCard = { title: string; kind: string; description: string };

type PreviewMessages = {
  badge: string;
  title: string;
  description: string;
  city: string;
  scene: string;
  experiences: string;
  choose: string;
  guide: string;
  fixtureNote: string;
  customer: PreviewCard & { action: string };
  restaurant: PreviewCard;
  admin: PreviewCard;
  motion: PreviewCard;
};

export const previewMessages: Record<PublicLocale, PreviewMessages> = {
  fr: {
    badge: "Aperçu équipe",
    title: "Alger, de table en table.",
    description:
      "Découvrez les restaurants d’Alger et les écrans qui accompagnent leur activité, à partir de données de démonstration.",
    city: "La Casbah d’Alger",
    scene: "Scène en 3D",
    experiences: "À explorer",
    choose: "Choisissez votre parcours",
    guide: "Guide visuel",
    fixtureNote:
      "Les écrans et animations de la galerie sont des exemples. Le catalogue de démonstration utilise des données fictives.",
    customer: {
      title: "Client",
      kind: "Catalogue interactif",
      description:
        "Recherchez par nom de restaurant ou type de cuisine et consultez les menus de démonstration.",
      action: "Découvrir les restaurants",
    },
    restaurant: {
      title: "Restaurant",
      kind: "Exemples d’écrans",
      description: "Parcourez les écrans de facturation, de promotions, d’avis et de statistiques.",
    },
    admin: {
      title: "Administration",
      kind: "Exemples d’écrans",
      description:
        "Consultez les exemples de factures, d’abonnements et de paramètres de la plateforme.",
    },
    motion: {
      title: "Animations et livraison",
      kind: "Galerie interactive",
      description:
        "Testez l’ajout au panier, le tajine de confirmation et l’animation du repère sur la carte.",
    },
  },
  en: {
    badge: "Team preview",
    title: "Algiers, one table at a time.",
    description:
      "Explore the Algiers restaurant experience and the screens that support it, using demo data.",
    city: "The Casbah of Algiers",
    scene: "3D scene",
    experiences: "Explore the preview",
    choose: "Choose an experience",
    guide: "Design guide",
    fixtureNote:
      "Gallery screens and animations are examples. The demo catalogue uses fictional data.",
    customer: {
      title: "Customer",
      kind: "Interactive catalogue",
      description: "Search by restaurant name or cuisine and browse sample menus.",
      action: "Explore restaurants",
    },
    restaurant: {
      title: "Restaurant",
      kind: "Screen examples",
      description: "Browse sample billing, promotions, reviews and analytics screens.",
    },
    admin: {
      title: "Administration",
      kind: "Screen examples",
      description: "Review sample invoices, subscriptions and platform settings.",
    },
    motion: {
      title: "Motion and delivery",
      kind: "Interactive gallery",
      description: "Try adding to the cart, the tagine confirmation and the animated map pin.",
    },
  },
  ar: {
    badge: "معاينة الفريق",
    title: "الجزائر العاصمة، من مائدة إلى أخرى.",
    description:
      "تعرّف على تجربة اكتشاف مطاعم العاصمة والشاشات المساندة لها باستخدام بيانات تجريبية.",
    city: "قصبة الجزائر",
    scene: "مشهد ثلاثي الأبعاد",
    experiences: "استكشف المعاينة",
    choose: "اختر تجربة",
    guide: "دليل التصميم",
    fixtureNote: "تضمّ المعارض شاشات وحركات توضيحية. يستخدم دليل المطاعم التجريبي بيانات وهمية.",
    customer: {
      title: "الزبون",
      kind: "دليل مطاعم تفاعلي",
      description: "ابحث باسم المطعم أو نوع المطبخ، وتصفّح قوائم الطعام التجريبية.",
      action: "اكتشف المطاعم",
    },
    restaurant: {
      title: "المطعم",
      kind: "نماذج شاشات",
      description: "تصفّح نماذج شاشات الفوترة والعروض والتقييمات والإحصاءات.",
    },
    admin: {
      title: "الإدارة",
      kind: "نماذج شاشات",
      description: "اطّلع على نماذج الفواتير والاشتراكات وإعدادات المنصة.",
    },
    motion: {
      title: "الحركة والتوصيل",
      kind: "معرض تفاعلي",
      description: "جرّب حركة الإضافة إلى السلة، وطاجين تأكيد الطلب، وظهور العلامة على الخريطة.",
    },
  },
};
