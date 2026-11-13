// The full-page design screens (design build only).

export const realScreens = [
  "checkout",
  "checkout-payment",
  "confirmed",
  "tracking",
  "tracking-waiting",
  "tracking-pickup",
  "rating",
  "orders",
  // Every state, for the states evidence (design build only).
  "checkout-loading",
  "checkout-error",
  "checkout-empty",
  "checkout-expired-cart",
  "checkout-promo",
  "checkout-offer",
  "checkout-promo-rejected",
  "tracking-loading",
  "tracking-error",
  "tracking-not-found",
  "tracking-delivered",
  "tracking-rejected",
  "tracking-expired",
  "tracking-cancelled",
  "tracking-delivery-failed",
  "orders-loading",
  "orders-empty",
  "orders-error",
  "rating-loading",
  "rating-error",
] as const;
export type RealScreen = (typeof realScreens)[number];
