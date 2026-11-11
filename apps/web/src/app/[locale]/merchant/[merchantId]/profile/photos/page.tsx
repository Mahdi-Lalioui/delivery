import { requireLatinLocale } from "../../../../../../i18n/latin-locale";
import { requireSetupMerchantId } from "../../../../../../merchant-onboarding/components/merchant-onboarding-page";
import {
  MerchantProfilePhotosPage,
  merchantProfilePhotosMetadata,
} from "../../../../../../merchant-profile-photos/components/merchant-profile-photos-page";

interface Props {
  params: Promise<{ locale: string; merchantId: string }>;
}

export async function generateMetadata(props: Props) {
  return merchantProfilePhotosMetadata(await requireLatinLocale(props));
}

export default async function LatinMerchantProfilePhotos(props: Props) {
  const [merchantId, locale] = await Promise.all([
    requireSetupMerchantId(props),
    requireLatinLocale(props),
  ]);
  return <MerchantProfilePhotosPage merchantId={merchantId} locale={locale} />;
}
