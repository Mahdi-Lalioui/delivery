import {
  requireMenuMerchantId,
  type MenuCategoryRouteProps,
} from "../../../../../menu-category/components/menu-category-page";
import { SharePage, shareMetadata } from "../../../../../retention/retention-pages";

export function generateMetadata() {
  return shareMetadata("ar");
}

export default async function ArabicMerchantShare(props: MenuCategoryRouteProps) {
  return <SharePage merchantId={await requireMenuMerchantId(props)} locale="ar" />;
}
