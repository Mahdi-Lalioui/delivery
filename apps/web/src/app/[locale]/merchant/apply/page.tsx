import { requireLatinLocale, type LatinPageProps } from "../../../../i18n/latin-locale";
import { MerchantPage, merchantMetadata } from "../../../../merchant/components/merchant-page";

export async function generateMetadata(props: LatinPageProps) {
  return merchantMetadata({ locale: await requireLatinLocale(props), screen: "application" });
}

export default async function LatinMerchantApplication(props: LatinPageProps) {
  return <MerchantPage locale={await requireLatinLocale(props)} screen="application" />;
}
