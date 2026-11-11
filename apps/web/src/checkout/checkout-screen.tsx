"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { CheckoutView } from "./checkout-view";
import { useCheckout } from "./use-checkout";

export function CheckoutScreen({ locale }: { locale: Locale }) {
  return <CheckoutView state={useCheckout()} locale={locale} />;
}
