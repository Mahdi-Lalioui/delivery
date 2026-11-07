import { MerchantPage, merchantMetadata } from "../../../../merchant/components/merchant-page";

export function generateMetadata() {
  return merchantMetadata({ locale: "ar", screen: "application" });
}

export default function ArabicMerchantApplication() {
  return <MerchantPage locale="ar" screen="application" />;
}
