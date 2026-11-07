import { requireLatinLocale, type LatinPageProps } from "../../../i18n/latin-locale";
import { MerchantPage, merchantMetadata } from "../../../merchant/components/merchant-page";

export async function generateMetadata(props: LatinPageProps) {
  return merchantMetadata({ locale: await requireLatinLocale(props), screen: "status" });
}

export default async function LatinMerchantStatus(props: LatinPageProps) {
  return <MerchantPage locale={await requireLatinLocale(props)} screen="status" />;
}
