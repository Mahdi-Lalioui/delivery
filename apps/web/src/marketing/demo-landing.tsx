import type { PublicLocale } from "@zaafran/i18n/locales";
import { Icon } from "@zaafran/ui";
import { DiscoverySearch } from "../discovery/search";
import { CasbahHero } from "./casbah-hero";
import { heroSeed } from "./casbah-poster";

const copy = {
  fr: {
    city: "Livraison à Alger",
    title: "Vos restaurants d’Alger, livrés chez vous.",
    intro: "Trouvez votre plat, commandez et payez en espèces à la livraison.",
    browse: "Voir tous les restaurants",
    scroll: "Explorer la Casbah",
    scene: "D’un quartier à l’autre",
    sceneDescription: "Suivez le trajet d’une livraison au-dessus de la Casbah.",
    open: "Lancer la scène 3D",
    close: "Revenir à l’illustration",
    loading: "Chargement de la scène…",
    unavailable: "La scène animée est indisponible sur cet appareil. L’illustration reste visible.",
    instruction: "Déplacez le pointeur sur la scène pour changer de perspective.",
  },
  ar: {
    city: "توصيل في الجزائر العاصمة",
    title: "من مطاعم العاصمة إلى باب دارك.",
    intro: "اختر طبقك، اطلبه وادفع نقدًا عند الاستلام.",
    browse: "عرض كل المطاعم",
    scroll: "استكشف القصبة",
    scene: "من حيّ إلى حيّ",
    sceneDescription: "تابع مسار التوصيل فوق أسطح القصبة.",
    open: "شغّل المشهد ثلاثي الأبعاد",
    close: "العودة إلى الرسم",
    loading: "جارٍ تحميل المشهد…",
    unavailable: "المشهد المتحرّك غير متاح على هذا الجهاز. يمكنك مشاهدة الرسم.",
    instruction: "حرّك المؤشر فوق المشهد لتغيير زاوية الرؤية.",
  },
  en: {
    city: "Delivery in Algiers",
    title: "Your Algiers favourites, delivered.",
    intro: "Find your dish, order and pay cash on delivery.",
    browse: "Browse all restaurants",
    scroll: "Explore the Casbah",
    scene: "From one neighbourhood to the next",
    sceneDescription: "Follow a delivery over the rooftops of the Casbah.",
    open: "Launch the 3D scene",
    close: "Return to the illustration",
    loading: "Loading the scene…",
    unavailable:
      "The animated scene is unavailable on this device. The illustration is still available.",
    instruction: "Move your pointer over the scene to change the view.",
  },
};

export function DemoLandingHero({ locale, startId }: { locale: PublicLocale; startId: string }) {
  const labels = copy[locale];
  return (
    <section className="demo-landing-hero" aria-labelledby="landing-title">
      <div className="demo-photo-backdrop" aria-hidden="true">
        <img src="/preview-catalog/casbah.webp" alt="" fetchPriority="high" />
      </div>
      <div className="demo-landing-inner container">
        <div className="demo-landing-copy">
          <p className="demo-city-label">{labels.city}</p>
          <h1 id="landing-title">{labels.title}</h1>
          <p className="demo-landing-intro">{labels.intro}</p>
          <DiscoverySearch locale={locale} />
          <a className="demo-landing-browse" href={`/${locale}/discover`} id={startId}>
            {labels.browse}
            <Icon name="chevron" size={16} />
          </a>
        </div>
        <a className="demo-photo-scroll" href="#landing-casbah">
          {labels.scroll}
          <span aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

export function DemoCasbah({ locale, startId }: { locale: PublicLocale; startId: string }) {
  const labels = copy[locale];
  return (
    <section
      className="landing-section demo-casbah"
      id="landing-casbah"
      aria-labelledby="casbah-title"
    >
      <div className="demo-casbah-copy">
        <h2 id="casbah-title">{labels.scene}</h2>
        <p>{labels.sceneDescription}</p>
      </div>
      <CasbahHero
        seed={heroSeed}
        homeTargetId={startId}
        manual={labels}
        poster={
          <img className="casbah-poster" src="/preview-catalog/casbah.webp" alt="" loading="lazy" />
        }
      />
    </section>
  );
}
