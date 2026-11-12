# Customer readiness handoff

Lane B owns customer feel and haptics, Arabic/French/English copy, consistency, reduction,
accessibility and the final screen review. Lane A owns the photo pipeline and performance.
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
