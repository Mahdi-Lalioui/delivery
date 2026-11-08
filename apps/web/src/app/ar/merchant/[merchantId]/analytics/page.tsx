import {
  requireMenuMerchantId,
  type MenuCategoryRouteProps,
} from "../../../../../menu-category/components/menu-category-page";
import { AnalyticsPage, analyticsMetadata } from "../../../../../retention/retention-pages";

export function generateMetadata() {
  return analyticsMetadata("ar");
}

export default async function ArabicMerchantAnalytics(props: MenuCategoryRouteProps) {
  return <AnalyticsPage merchantId={await requireMenuMerchantId(props)} locale="ar" />;
}
