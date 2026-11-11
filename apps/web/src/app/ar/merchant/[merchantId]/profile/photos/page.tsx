import {
  requireSetupMerchantId,
  type MerchantSetupRouteProps,
} from "../../../../../../merchant-onboarding/components/merchant-onboarding-page";
import {
  MerchantProfilePhotosPage,
  merchantProfilePhotosMetadata,
} from "../../../../../../merchant-profile-photos/components/merchant-profile-photos-page";

export function generateMetadata() {
  return merchantProfilePhotosMetadata("ar");
}

export default async function ArabicMerchantProfilePhotos(props: MerchantSetupRouteProps) {
  return <MerchantProfilePhotosPage merchantId={await requireSetupMerchantId(props)} locale="ar" />;
}
