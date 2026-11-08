import { requireLatinLocale } from "../../../../../i18n/latin-locale";
import {
  MerchantOnboardingPage,
  merchantOnboardingMetadata,
  requireSetupMerchantId,
} from "../../../../../merchant-onboarding/components/merchant-onboarding-page";

interface Props {
  params: Promise<{ locale: string; merchantId: string }>;
}

export async function generateMetadata(props: Props) {
  return merchantOnboardingMetadata(await requireLatinLocale(props));
}

export default async function LatinMerchantSetup(props: Props) {
  const [merchantId, locale] = await Promise.all([
    requireSetupMerchantId(props),
    requireLatinLocale(props),
  ]);
  return <MerchantOnboardingPage merchantId={merchantId} locale={locale} />;
}
