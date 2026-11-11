import { CheckoutPage, checkoutMetadata } from "../../../checkout/checkout-page";
import { requireLatinLocale, type LatinPageProps } from "../../../i18n/latin-locale";

export async function generateMetadata(props: LatinPageProps) {
  return checkoutMetadata(await requireLatinLocale(props));
}

export default async function LatinCheckout(props: LatinPageProps) {
  return <CheckoutPage locale={await requireLatinLocale(props)} />;
}
