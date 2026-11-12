# Offer badges and promo code (lane B, 2026-11-12)

Data: lane A's feed `offer` (percent with cap, fixed, free delivery, each with a minimum
subtotal) and quote `promotionCode` / `discountDzd` with the published `promotion_*` problem
codes. Server totals stay authoritative; the web never computes a discount.

## Discovery badge

- A harissa ribbon in the photo's bottom-end corner (clear of "Fermé" at top-start, "Nouveau"
  at bottom-start and the heart at top-end): the saving on top (−15 %, −200 DA, Livraison
  offerte), its one condition beneath (jusqu'à 400 DA, dès 1 500 DA).
- Spoken as one phrase: "Offre : −200 DA, dès 1 500 DA".
- "Offres" quick filter (`offers=true` in the URL, removable chip); the preview catalog honours it.
- Arabic isolates the percentage so it reads 15% (not %15).
- Captures: `discover-{ar-390,fr-390,fr-1280,fr-390-dark}[-full].png`.

## Checkout promo code (payment step)

- Folded behind "Ajouter un code promo" so the total stays the focal point.
- Apply re-quotes with the code. Applied: a mint row "Code RAMADAN" with "Retirer le code", and
  a green "Réduction / RAMADAN −300 DA" line in the totals.
- Automatic offers show as "Réduction / Offre du restaurant" with no code needed.
- Refused code: dropped, the basket re-quoted without it, the field stays open with the reason
  and a next step (expired, minimum not reached, used up, not valid here) in ar, fr and en.
- An offer that stops being valid between quote and order makes placement fail as "expired",
  which already says "Votre total a changé. Vérifiez-le et confirmez à nouveau."
- Captures: `checkout-promo-*`, `checkout-offer-*`, `checkout-promo-rejected-*`.
- Tests: `apps/web/test/discovery-offers.test.tsx`, `apps/web/test/checkout-promo.test.tsx`.
