import {
  requireMenuMerchantId,
  type MenuCategoryRouteProps,
} from "../../../../../menu-category/components/menu-category-page";
import {
  MerchantStaffPage,
  merchantStaffMetadata,
} from "../../../../../merchant-staff/components/merchant-staff-page";

export function generateMetadata() {
  return merchantStaffMetadata("ar");
}

export default async function ArabicMerchantStaff(props: MenuCategoryRouteProps) {
  return <MerchantStaffPage merchantId={await requireMenuMerchantId(props)} locale="ar" />;
}
