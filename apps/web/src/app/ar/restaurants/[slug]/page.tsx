import { LocalSimulationLink } from "../../../../local-demo/simulation-link";
import { CustomerData } from "../../../../discovery/customer-data";
import { SiteShell } from "../../../../components/site-shell";
import { RestaurantScreen } from "../../../../restaurant/restaurant-screen";

export default async function ArabicRestaurant({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const demo = process.env.NODE_ENV === "development" && process.env.ZAAFRAN_LOCAL_DEMO === "1";
  return (
    <CustomerData>
      <SiteShell locale="ar" subpath={`/restaurants/${slug}`}>
        <RestaurantScreen
          locale="ar"
          slug={slug}
          cartAction={demo ? <LocalSimulationLink locale={"ar"} /> : undefined}
        />
      </SiteShell>
    </CustomerData>
  );
}
