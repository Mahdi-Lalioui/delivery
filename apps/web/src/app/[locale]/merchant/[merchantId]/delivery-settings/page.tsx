import { requireLatinLocale } from "../../../../../i18n/latin-locale";
import { requireMenuMerchantId } from "../../../../../menu-category/components/menu-category-page";
import {
  MerchantDeliveryPage,
  deliveryMetadata,
} from "../../../../../merchant-delivery/delivery-page";

interface Props {
  params: Promise<{ locale: string; merchantId: string }>;
}

export async function generateMetadata(props: Props) {
  return deliveryMetadata(await requireLatinLocale(props));
}

export default async function LatinMerchantDelivery(props: Props) {
  const [merchantId, locale] = await Promise.all([
    requireMenuMerchantId(props),
    requireLatinLocale(props),
  ]);
  return <MerchantDeliveryPage merchantId={merchantId} locale={locale} />;
}
