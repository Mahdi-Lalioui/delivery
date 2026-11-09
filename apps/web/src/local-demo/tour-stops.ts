import { createHash } from "node:crypto";

export const tourLocales = ["fr", "ar"] as const;
export type TourLocale = (typeof tourLocales)[number];

const demoRestaurant = "demo-lune-de-semoule";
const hash = createHash("md5").update(`local-tour:${demoRestaurant}`).digest("hex");
const merchantId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20)}`;
const merchant = `/merchant/${merchantId}`;
const restaurant = `/restaurants/tour-${demoRestaurant}`;
const orderId = "019d6abc-0000-7000-8000-000000000601";

type Stop = {
  path: string;
  fr: readonly [title: string, caption: string];
  ar: readonly [title: string, caption: string];
  action?: string;
};
type Group = {
  role: "public" | "customer" | "owner" | "admin";
  fr: string;
  ar: string;
  stops: readonly Stop[];
};

export const tourGroups: readonly Group[] = [
  {
    role: "public",
    fr: "L’entrée en matière",
    ar: "البداية",
    stops: [
      {
        path: "",
        fr: ["La Casbah", "Survolez Alger dans le décor en 3D."],
        ar: ["القصبة", "تجوّل فوق الجزائر العاصمة في مشهد ثلاثي الأبعاد."],
      },
      {
        path: "/restaurants",
        fr: ["Le modèle restaurant", "Comparez les frais fixes avec le calculateur."],
        ar: ["عرض المطاعم", "قارن الرسوم الثابتة بالحاسبة."],
      },
      {
        path: "/dev/moments",
        fr: ["Les animations", "Essayez le tajine, le panier et le repère sur la carte."],
        ar: ["الحركات", "جرّب الطاجين والسلة وعلامة الخريطة."],
      },
      {
        path: "/dev/design",
        fr: ["Le système de design", "Explorez les composants et leurs états."],
        ar: ["نظام التصميم", "استكشف المكوّنات وحالاتها."],
      },
    ],
  },
  {
    role: "customer",
    fr: "Une commande à Alger",
    ar: "طلب في الجزائر العاصمة",
    stops: [
      {
        path: "/discover?tour=location",
        action: "location",
        fr: ["Position", "Ouvrez le sélecteur et choisissez une commune."],
        ar: ["الموقع", "افتح محدّد الموقع واختر بلدية."],
      },
      {
        path: "/discover",
        fr: ["Découverte", "Parcourez les restaurants et les cuisines."],
        ar: ["اكتشاف", "تصفّح المطاعم وأنواع المأكولات."],
      },
      {
        path: "/discover?tour=search",
        action: "search",
        fr: ["Recherche", "Ouvrez la recherche et essayez couscous."],
        ar: ["البحث", "افتح البحث وجرّب كلمة كسكس."],
      },
      {
        path: restaurant,
        fr: ["Le restaurant", "Découvrez la carte de Lune de Semoule."],
        ar: ["المطعم", "تصفّح قائمة قمر السميد."],
      },
      {
        path: `${restaurant}?tour=item`,
        action: "item",
        fr: ["La fiche plat", "Choisissez un plat pour afficher ses options."],
        ar: ["تفاصيل الطبق", "اختر طبقًا لعرض خياراته."],
      },
      {
        path: `${restaurant}?tour=cart`,
        action: "cart",
        fr: ["Le panier", "Ajoutez un plat, puis ouvrez le panier."],
        ar: ["السلة", "أضف طبقًا ثم افتح السلة."],
      },
      {
        path: "/dev/simulation",
        fr: ["Simulation de commande", "Suivez une livraison simulée depuis votre panier."],
        ar: ["محاكاة الطلب", "تابع رحلة توصيل تجريبية من سلّتك."],
      },
      {
        path: "/orders",
        fr: ["Mes commandes", "Retrouvez l’historique et les favoris."],
        ar: ["طلباتي", "راجع الطلبات السابقة والمفضّلة."],
      },
      {
        path: "/orders?tour=receipt",
        action: "receipt",
        fr: ["Le reçu", "Ouvrez le reçu de la commande livrée."],
        ar: ["الإيصال", "افتح إيصال الطلب الذي تم توصيله."],
      },
      {
        path: `/orders/${orderId}/rating`,
        fr: ["L’avis", "Évaluez le repas et la livraison."],
        ar: ["التقييم", "قيّم الوجبة والتوصيل."],
      },
      {
        path: "/account/privacy",
        fr: ["Confidentialité", "Consultez les outils de gestion des données."],
        ar: ["الخصوصية", "استعرض أدوات إدارة بياناتك."],
      },
    ],
  },
  {
    role: "owner",
    fr: "Les coulisses du restaurant",
    ar: "خلف كواليس المطعم",
    stops: [
      {
        path: "/merchant/apply",
        fr: ["Candidature", "Découvrez le formulaire d’inscription du restaurant."],
        ar: ["طلب الانضمام", "تعرّف على نموذج تسجيل المطعم."],
      },
      {
        path: `${merchant}/setup`,
        fr: ["Configuration", "Vérifiez la progression de mise en ligne."],
        ar: ["الإعداد", "تحقّق من جاهزية المطعم للنشر."],
      },
      {
        path: `${merchant}/menu`,
        fr: ["Éditeur de menu", "Parcourez les catégories, plats et options."],
        ar: ["محرّر القائمة", "تصفّح الأقسام والأطباق والخيارات."],
      },
      {
        path: `${merchant}/menu?tour=import`,
        action: "import",
        fr: ["Import CSV", "Ouvrez le panneau d’import de menu."],
        ar: ["استيراد CSV", "افتح لوحة استيراد القائمة."],
      },
      {
        path: `${merchant}/profile/photos`,
        fr: ["Photos", "Retrouvez la couverture et le logo."],
        ar: ["الصور", "استعرض صورة الغلاف والشعار."],
      },
      {
        path: `${merchant}/hours`,
        fr: ["Horaires et Ramadan", "Passez des horaires ordinaires à ceux du Ramadan."],
        ar: ["المواعيد ورمضان", "بدّل بين المواعيد المعتادة ومواعيد رمضان."],
      },
      {
        path: `${merchant}/promotions`,
        fr: ["Promotions", "Affichez le code SAFRAN15 et ses conditions."],
        ar: ["العروض", "اعرض الرمز SAFRAN15 وشروطه."],
      },
      {
        path: `${merchant}/analytics`,
        fr: ["Statistiques", "Consultez les ventes et les heures de pointe."],
        ar: ["الإحصاءات", "راجع المبيعات وساعات الذروة."],
      },
      {
        path: `${merchant}/reviews`,
        fr: ["Avis et réponses", "Parcourez les commentaires et les réponses."],
        ar: ["التقييمات والردود", "تصفّح التعليقات والردود."],
      },
      {
        path: `${merchant}/billing`,
        fr: ["Facturation", "Vérifiez l’abonnement et les factures."],
        ar: ["الفوترة", "تحقّق من الاشتراك والفواتير."],
      },
      {
        path: `${merchant}/share`,
        fr: ["Kit de partage", "Découvrez le lien public et le code QR."],
        ar: ["أدوات المشاركة", "استعرض الرابط العام ورمز QR."],
      },
      {
        path: `${merchant}/staff`,
        fr: ["Équipe", "Consultez les rôles et les invitations."],
        ar: ["الفريق", "اطّلع على الأدوار والدعوات."],
      },
    ],
  },
  {
    role: "admin",
    fr: "La gestion de la plateforme",
    ar: "إدارة المنصّة",
    stops: [
      {
        path: "/admin/dashboard",
        fr: ["Tableau de bord", "Suivez les commandes, les ventes et les alertes."],
        ar: ["لوحة المعلومات", "تابع الطلبات والمبيعات والتنبيهات."],
      },
      {
        path: "/admin/merchant-applications",
        fr: ["Candidatures", "Examinez les demandes d’ouverture en attente."],
        ar: ["طلبات الانضمام", "راجع طلبات فتح المطاعم المعلّقة."],
      },
      {
        path: "/admin/menu-items",
        fr: ["Modération", "Ouvrez la file de plats à examiner."],
        ar: ["المراجعة", "افتح قائمة الأطباق المطلوب مراجعتها."],
      },
      {
        path: "/admin/billing",
        fr: ["Facturation", "Comparez les états des abonnements."],
        ar: ["الفوترة", "قارن حالات الاشتراكات."],
      },
      {
        path: "/admin/platform",
        fr: ["Console", "Consultez les paramètres et les options de la plateforme."],
        ar: ["وحدة التحكّم", "اطّلع على إعدادات المنصّة وخياراتها."],
      },
    ],
  },
];
