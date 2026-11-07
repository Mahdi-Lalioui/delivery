import { requireLatinLocale } from "../../../../../../../i18n/latin-locale";
import {
  MenuItemPage,
  menuItemMetadata,
  requireItemRouteIds,
} from "../../../../../../../menu-item/components/menu-item-page";

interface Props {
  params: Promise<{ locale: string; merchantId: string; categoryId: string }>;
}

export async function generateMetadata(props: Props) {
  return menuItemMetadata(await requireLatinLocale(props));
}

export default async function LatinMenuItems(props: Props) {
  const [ids, locale] = await Promise.all([requireItemRouteIds(props), requireLatinLocale(props)]);
  return <MenuItemPage {...ids} locale={locale} />;
}
