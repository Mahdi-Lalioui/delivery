import { requireLatinLocale } from "../../../../../i18n/latin-locale";
import { requireMenuMerchantId } from "../../../../../menu-category/components/menu-category-page";
import {
  MerchantHoursPage,
  merchantHoursMetadata,
} from "../../../../../merchant-hours/components/merchant-hours-page";

interface Props {
  params: Promise<{ locale: string; merchantId: string }>;
}

export async function generateMetadata(props: Props) {
  return merchantHoursMetadata(await requireLatinLocale(props));
}

export default async function LatinMerchantHours(props: Props) {
  const [merchantId, locale] = await Promise.all([
    requireMenuMerchantId(props),
    requireLatinLocale(props),
  ]);
  return <MerchantHoursPage merchantId={merchantId} locale={locale} />;
}
