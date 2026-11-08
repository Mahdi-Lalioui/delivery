import { requireLatinLocale } from "../../../../../i18n/latin-locale";
import { requireMenuMerchantId } from "../../../../../menu-category/components/menu-category-page";
import { SharePage, shareMetadata } from "../../../../../retention/retention-pages";

interface Props {
  params: Promise<{ locale: string; merchantId: string }>;
}

export async function generateMetadata(props: Props) {
  return shareMetadata(await requireLatinLocale(props));
}

export default async function LatinMerchantShare(props: Props) {
  const [merchantId, locale] = await Promise.all([
    requireMenuMerchantId(props),
    requireLatinLocale(props),
  ]);
  return <SharePage merchantId={merchantId} locale={locale} />;
}
