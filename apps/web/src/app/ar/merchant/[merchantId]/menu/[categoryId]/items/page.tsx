import {
  MenuItemPage,
  menuItemMetadata,
  requireItemRouteIds,
  type MenuItemRouteProps,
} from "../../../../../../../menu-item/components/menu-item-page";

export function generateMetadata() {
  return menuItemMetadata("ar");
}

export default async function ArabicMenuItems(props: MenuItemRouteProps) {
  return <MenuItemPage {...await requireItemRouteIds(props)} locale="ar" />;
}
