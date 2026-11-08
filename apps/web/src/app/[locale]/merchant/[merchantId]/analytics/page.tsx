import { requireLatinLocale } from "../../../../../i18n/latin-locale";
import { requireMenuMerchantId } from "../../../../../menu-category/components/menu-category-page";
import { AnalyticsPage, analyticsMetadata } from "../../../../../retention/retention-pages";

interface Props {
  params: Promise<{ locale: string; merchantId: string }>;
}

export async function generateMetadata(props: Props) {
  return analyticsMetadata(await requireLatinLocale(props));
}

export default async function LatinMerchantAnalytics(props: Props) {
  const [merchantId, locale] = await Promise.all([
    requireMenuMerchantId(props),
    requireLatinLocale(props),
  ]);
  return <AnalyticsPage merchantId={merchantId} locale={locale} />;
}
