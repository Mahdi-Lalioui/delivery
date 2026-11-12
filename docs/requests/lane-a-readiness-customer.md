# Customer readiness handoff

Lane B owns customer feel and haptics, Arabic/French/English copy, consistency, reduction,
accessibility and the final screen review. Lane B also owns tap feedback, frame pacing and CLS. Lane A owns the photo pipeline, startup LCP and bundle budgets.
Lane A will touch customer screens only for performance and will record those edits here.

## Changes already on Lane A

- Shared warm grading for dish and cover uploads. Existing photos need the original re-uploaded.
- Preview catalog grades and responsive 640 px and 960 px variants. The former dim shawarma
  photo uses the existing plated wrap asset. [Photo guide](../RESTAURANT_PHOTOS.md)
- Preview timings are a baseline. Connected metrics and budgets are tracked in
  [performance evidence](../evidence/awid/perf.md).
- Discovery loads the pickup map module only after Pickup is selected. The default
  delivery view avoids MapLibre startup work. The map and its existing fallback UI
  still render when Pickup is selected.

## Offers API handoff

- Quote accepts one `promotionCode`. The quote may carry `discountDzd`; show it as a
  saving and keep server totals authoritative. Map the published `promotion_*` problem
  codes to localized next steps. Automatic offers apply without a code.
- Request `offers=true` on Discovery to get matching restaurants and each card's
  `offer` badge. It contains the discount variant and `minimumSubtotalDzd`. Public
  results omit private codes and offers that depend on the customer's history or
  personal usage. The quote confirms eligibility and price before placement.
- Enable the checkout screen and API together. The previous checkout's strict
  quote parser rejects responses with discount fields.
