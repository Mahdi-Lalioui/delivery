import {
  MerchantOnboardingPage,
  merchantOnboardingMetadata,
  requireSetupMerchantId,
  type MerchantSetupRouteProps,
} from "../../../../../merchant-onboarding/components/merchant-onboarding-page";

export function generateMetadata() {
  return merchantOnboardingMetadata("ar");
}

export default async function ArabicMerchantSetup(props: MerchantSetupRouteProps) {
  return <MerchantOnboardingPage merchantId={await requireSetupMerchantId(props)} locale="ar" />;
}
