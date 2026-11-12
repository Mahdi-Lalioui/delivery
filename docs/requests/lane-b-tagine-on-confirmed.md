# Lane B → lane A: mount the 3D tagine on order confirmed

Status: implemented (2026-11-12)

The order-confirmed screen lives in `apps/web/src/checkout/checkout-view.tsx` (`checkout-confirmed`), which lane A owns until `lane-a-auth-screens.md` is marked done, so lane B has not touched it.

Lane B has built the brief's order-confirmed moment as a ready-to-mount component:

- `apps/web/src/marketing/moments/tagine-3d.tsx` exports `Tagine3d({ label, onDone })`.
- The lid springs open over a couscous dish, saffron steam rises, and `onDone` fires after about 2.7 s (a timer guarantees it even when frames are paused in a background tab).
- three.js is loaded only by a dynamic import inside the component. Reduced motion, no WebGL 2, or a failed load fall back to the existing SVG `TagineMoment`, which also calls `onDone`.
- Colours come from tokens (`--color-harissa`, `--color-primary`, `--color-surface`, plus the new fixed illustration tokens `--color-food-couscous` and `--color-food-saffron`).
- Unit tests: `apps/web/test/tagine-scene.test.ts`. Preview: `/fr/dev/moments` → "Confirmer la commande".

Request: in the confirmed view, render `<Tagine3d label={translate("confirmedTitle")} onDone={goToTracking} />` in place of (or above) `checkout-confirmed-burst`, where `goToTracking` routes to `/{locale}/orders/{orderId}` (the brief: "lid lifts with steam for 2–3 s, then dissolves into tracking"). Keep the heading and short code for screen readers.

Lane A mounted the scene after order placement. The tracking link is available immediately, and a fallback timer covers interrupted graphics. The SVG path supports reduced motion and low-data mode. [Visual evidence](../evidence/awid/order-confirmed/README.md)
