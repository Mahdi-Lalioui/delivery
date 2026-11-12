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
] as const;
export type RealScreen = (typeof realScreens)[number];
