import { CustomerData } from "../../../../discovery/customer-data";
import { SiteShell } from "../../../../components/site-shell";
import { CustomerTabBar } from "../../../../customer/tab-bar";
import { RestaurantScreen } from "../../../../restaurant/restaurant-screen";

export default async function ArabicRestaurant({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <CustomerData>
      <SiteShell locale="ar" subpath={`/restaurants/${slug}`}>
        <RestaurantScreen locale="ar" slug={slug} />
        <CustomerTabBar locale={"ar"} current="home" />
      </SiteShell>
    </CustomerData>
  );
}
