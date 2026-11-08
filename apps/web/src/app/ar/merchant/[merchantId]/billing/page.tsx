import {
  MerchantBillingPage,
  merchantBillingMetadata,
} from "../../../../../admin/billing/merchant-billing-page";
import {
  requireMenuMerchantId,
  type MenuCategoryRouteProps,
} from "../../../../../menu-category/components/menu-category-page";

export function generateMetadata() {
  return merchantBillingMetadata("ar");
}

export default async function ArabicMerchantBilling(props: MenuCategoryRouteProps) {
  return <MerchantBillingPage merchantId={await requireMenuMerchantId(props)} locale="ar" />;
}
