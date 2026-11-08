import {
  requireMenuMerchantId,
  type MenuCategoryRouteProps,
} from "../../../../../menu-category/components/menu-category-page";
import { PromotionsPage, promotionsMetadata } from "../../../../../retention/retention-pages";

export function generateMetadata() {
  return promotionsMetadata("ar");
}

export default async function ArabicMerchantPromotions(props: MenuCategoryRouteProps) {
  return <PromotionsPage merchantId={await requireMenuMerchantId(props)} locale="ar" />;
}
