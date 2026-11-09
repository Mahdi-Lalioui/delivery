import { LocalSimulationLink } from "../../../../local-demo/simulation-link";
import { CustomerData } from "../../../../discovery/customer-data";
import { SiteShell } from "../../../../components/site-shell";
import { requireLatinLocale } from "../../../../i18n/latin-locale";
import { RestaurantScreen } from "../../../../restaurant/restaurant-screen";

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export default async function LatinRestaurant(props: Props) {
  const [locale, { slug }] = await Promise.all([requireLatinLocale(props), props.params]);
  return (
    <CustomerData>
      <SiteShell locale={locale} subpath={`/restaurants/${slug}`}>
        <RestaurantScreen
          locale={locale === "en-XA" ? "en" : locale}
          slug={slug}
          cartAction={<LocalSimulationLink locale={locale === "en-XA" ? "en" : locale} />}
        />
      </SiteShell>
    </CustomerData>
  );
}
