# Checkout — round 1 flaws

Captured on the real full-page routes `/[locale]/dev/screens/checkout`, `checkout-payment` and
`confirmed`. Compared with Uber Eats and Deliveroo checkout.

1. **Trust.** The review lists dish names without line prices, so the customer cannot check what
   they pay for.
2. **Grouping.** Totals float bare between cards; lines and totals belong in one receipt card.
3. **Anchor.** The header ("Commande / Dar Yemma") has no visual anchor for the restaurant.
4. **Motion.** The total does not move when it changes (pickup removes the fee); the screen's
   memorable detail should be a rolling total.
5. **Celebration.** The confirmed moment is a flat green field; it should carry the brand pattern.
