import { CheckoutPage, checkoutMetadata } from "../../../checkout/checkout-page";

export const metadata = checkoutMetadata("ar");

export default function ArabicCheckout() {
  return <CheckoutPage locale="ar" />;
}
