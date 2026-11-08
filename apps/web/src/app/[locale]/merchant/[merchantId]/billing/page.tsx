import {
  MerchantBillingPage,
  merchantBillingMetadata,
} from "../../../../../admin/billing/merchant-billing-page";
import { requireLatinLocale } from "../../../../../i18n/latin-locale";
import { requireMenuMerchantId } from "../../../../../menu-category/components/menu-category-page";

interface Props {
  params: Promise<{ locale: string; merchantId: string }>;
}

export async function generateMetadata(props: Props) {
  return merchantBillingMetadata(await requireLatinLocale(props));
}

export default async function LatinMerchantBilling(props: Props) {
  const [merchantId, locale] = await Promise.all([
    requireMenuMerchantId(props),
    requireLatinLocale(props),
  ]);
  return <MerchantBillingPage merchantId={merchantId} locale={locale} />;
}
