import {
  MenuCategoryPage,
  menuCategoryMetadata,
  requireMenuMerchantId,
  type MenuCategoryRouteProps,
} from "../../../../../menu-category/components/menu-category-page";

export function generateMetadata() {
  return menuCategoryMetadata("ar");
}

export default async function ArabicMerchantMenu(props: MenuCategoryRouteProps) {
  return <MenuCategoryPage merchantId={await requireMenuMerchantId(props)} locale="ar" />;
}
