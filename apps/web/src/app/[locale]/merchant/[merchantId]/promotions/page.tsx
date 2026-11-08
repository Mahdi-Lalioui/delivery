import { requireLatinLocale } from "../../../../../i18n/latin-locale";
import { requireMenuMerchantId } from "../../../../../menu-category/components/menu-category-page";
import { PromotionsPage, promotionsMetadata } from "../../../../../retention/retention-pages";

interface Props {
  params: Promise<{ locale: string; merchantId: string }>;
}

export async function generateMetadata(props: Props) {
  return promotionsMetadata(await requireLatinLocale(props));
}

export default async function LatinMerchantPromotions(props: Props) {
  const [merchantId, locale] = await Promise.all([
    requireMenuMerchantId(props),
    requireLatinLocale(props),
  ]);
  return <PromotionsPage merchantId={merchantId} locale={locale} />;
}
