import {
  requireMenuMerchantId,
  type MenuCategoryRouteProps,
} from "../../../../../menu-category/components/menu-category-page";
import {
  MerchantDeliveryPage,
  deliveryMetadata,
} from "../../../../../merchant-delivery/delivery-page";

export function generateMetadata() {
  return deliveryMetadata("ar");
}

export default async function ArabicMerchantDelivery(props: MenuCategoryRouteProps) {
  return <MerchantDeliveryPage merchantId={await requireMenuMerchantId(props)} locale="ar" />;
}
