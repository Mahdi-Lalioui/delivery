# Customer readiness (no deployment until every line is ticked with evidence)

Lane B owns the customer UI/UX items; Codex owns performance and the photo pipeline.

- [x] Maps: AWID colours, page-language labels, branded pin cards with clustering, retry inside
      the fallback, real tiles on a production build. Evidence: `docs/evidence/awid/maps/`.
- [x] No restaurant named "Démo". Evidence: `docs/requests/lane-b-realistic-demo-names.md`.
- [ ] Feel: haptics, optional sound, mute setting, reduced motion.
- [ ] Copy in ar, fr, en: short, warm, every error says what to do next.
- [ ] Consistency audit: `docs/evidence/awid/consistency.md`, all fixed.
- [ ] Reduce: one focal point per screen.
- [ ] Accessibility: 44 px targets, focus, labels, contrast, keyboard, zero axe violations.
- [ ] Every state of every screen designed.
- [ ] Final jury round at ar-390, fr-390, fr-1280 and dark.
