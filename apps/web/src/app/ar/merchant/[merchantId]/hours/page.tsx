import {
  requireMenuMerchantId,
  type MenuCategoryRouteProps,
} from "../../../../../menu-category/components/menu-category-page";
import {
  MerchantHoursPage,
  merchantHoursMetadata,
} from "../../../../../merchant-hours/components/merchant-hours-page";

export function generateMetadata() {
  return merchantHoursMetadata("ar");
}

export default async function ArabicMerchantHours(props: MenuCategoryRouteProps) {
  return <MerchantHoursPage merchantId={await requireMenuMerchantId(props)} locale="ar" />;
}
