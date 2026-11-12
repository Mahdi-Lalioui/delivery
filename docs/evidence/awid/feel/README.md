# Feel: haptics, chime, mute (lane B, 2026-11-12)

- `apps/web/src/feel/feel.ts`: `buzz()` uses `navigator.vibrate` where it exists: one tap on
  add-to-cart (only when the cart grows), a double tap when the order is placed, a short rhythm
  when the restaurant accepts. `chime()` plays two soft sine notes from Web Audio on accepted,
  only if the diner turned sound on (off by default; no audio file).
- Mute: Profile tab, "Sensations" card with two native switches (`role="switch"`), saved in
  `localStorage` (`awid.feel.v1`).
- Reduced motion: haptics default to off when `prefers-reduced-motion: reduce`, unless the diner
  turns them on; switch animations are removed under reduced motion.
- Tests: `apps/web/test/feel.test.ts` (6 tests: defaults, mute, reduced motion, no vibration
  API, moment detection, chime only when chosen).
