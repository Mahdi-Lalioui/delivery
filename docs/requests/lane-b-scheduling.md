# Lane B request: slots route, Maghrib time and motion tokens (M6-4, CUS-13 / HRS-02 / HRS-03)

Requested 2026-11-08. `packages/contracts/src/scheduling.ts` covers the slot shapes.
Lane B built `apps/web/src/retention/{scheduling.ts,slot-picker.tsx,iftar-countdown.tsx}`.

1. **Slots route**: `GET /v1/slots?fulfilment=pickup|delivery&merchantId=&addressId=` →
   `customerSlotsOutput` (lane B's client already calls this path; tell lane B if it differs).
2. **Maghrib for home (HRS-03)**: the home countdown needs today's Maghrib instant for the
   customer's area while `ramadan_mode` is on. Proposed contract:
   `GET /v1/ramadan/today?communeId=` → `{ isRamadan: boolean, maghribAt: iso datetime | null }`,
   computed from the checked-in prayer-time table. `IftarCountdown` takes `maghribAt`.
3. **Checkout wiring (lane A, M4)**: render `<SlotPicker slots value onChange />` in checkout and send
   the chosen slot as `selectedSlot`; ASAP sends none.
4. **Motion tokens**: DESIGN §7 tokens (`instant 80`, `fast 140`, `base 220`, `slow 320`,
   `emphasis 480`, `scene`, `ease-standard`…) are not in `packages/tokens` yet. The Iftar glow and
   the M8 signature moments need them as CSS variables. Lane B can add them if lane A agrees that
   `packages/tokens` may be edited by lane B.
