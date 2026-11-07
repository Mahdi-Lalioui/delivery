import { requireLatinLocale } from "../../../../../i18n/latin-locale";
import {
  MenuCategoryPage,
  menuCategoryMetadata,
  requireMenuMerchantId,
} from "../../../../../menu-category/components/menu-category-page";

interface Props {
  params: Promise<{ locale: string; merchantId: string }>;
}

export async function generateMetadata(props: Props) {
  return menuCategoryMetadata(await requireLatinLocale(props));
}

export default async function LatinMerchantMenu(props: Props) {
  const [merchantId, locale] = await Promise.all([
    requireMenuMerchantId(props),
    requireLatinLocale(props),
  ]);
  return <MenuCategoryPage merchantId={merchantId} locale={locale} />;
}
