import { MerchantPage, merchantMetadata } from "../../../merchant/components/merchant-page";

export function generateMetadata() {
  return merchantMetadata({ locale: "ar", screen: "status" });
}

export default function ArabicMerchantStatus() {
  return <MerchantPage locale="ar" screen="status" />;
}
