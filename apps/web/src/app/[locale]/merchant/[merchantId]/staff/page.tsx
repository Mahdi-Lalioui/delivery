import { requireLatinLocale } from "../../../../../i18n/latin-locale";
import { requireMenuMerchantId } from "../../../../../menu-category/components/menu-category-page";
import {
  MerchantStaffPage,
  merchantStaffMetadata,
} from "../../../../../merchant-staff/components/merchant-staff-page";

interface Props {
  params: Promise<{ locale: string; merchantId: string }>;
}

export async function generateMetadata(props: Props) {
  return merchantStaffMetadata(await requireLatinLocale(props));
}

export default async function LatinMerchantStaff(props: Props) {
  const [merchantId, locale] = await Promise.all([
    requireMenuMerchantId(props),
    requireLatinLocale(props),
  ]);
  return <MerchantStaffPage merchantId={merchantId} locale={locale} />;
}
