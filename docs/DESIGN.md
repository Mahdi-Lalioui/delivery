# DESIGN — AWID

AWID ("You're in need, try AWID") should feel fresh, confident, appetising and unmistakably Algerian. Cream and white surfaces, deep green for structure, mint for energy, and food photography as the hero of every screen. Brand source: `docs/brand/awid-reference.jpg` (a starting point, not a layout to copy). Supersedes "Casbah Saffron" (DECISIONS D-B05).

## 1. Principles

1. **Food is the hero.** Every customer screen leads with a real, credited photo (`docs/PHOTO_CREDITS.md`). The UI stays cream, white and deep green around it.
2. **One focal point per view.** One primary action, quiet or separated destructive actions, status as badges.
3. **Fast is a feature.** Motion explains a change or confirms an action and never blocks input. Low-end Android over 4G is the default device.
4. **Local, not generic.** Arabic is a first-class layout, checked rather than mirrored. Prices look like Algerian prices (`1 450 DA`).
5. **One hand, one thumb.** Primary actions sit in the bottom third on mobile; restaurant and courier screens use big targets.
6. **Never cheap.** No generic colour gradients, default browser controls, lorem ipsum, mixed radii or shadows, borders around everything, centred walls of text, tiny targets, layout shift, empty-looking pages or emoji icons.

## 2. Brand

- **Name:** AWID, Arabic أويد until Mahdi confirms (`packages/config/src/brand.ts`). Package scopes and environment variables keep the `zaafran` names.
- **Logo:** the wordmark (speed lines, the courier "A", the pin over the i, WID) and the app icon are SVGs traced from the brand board: `apps/web/public/brand/awid-logo.svg`, `awid-logo-dark.svg`, `awid-icon.svg`, `awid-icon-dark.svg`. `Logo` and `LogoMark` in `packages/ui` swap to the dark variant with the theme. Never recolour or redraw them by hand; replace them when Mahdi sends the vector originals.
- **Motifs, used sparingly:** a zellige tile pattern (headers, empty states, loaders) and the soft wave from the icon as a section divider.

## 3. Colour tokens

Semantic names in code (`--color-primary`); source `packages/tokens/src/palettes.json`. `packages/tokens/test/contrast.test.ts` recomputes the WCAG ratios in both themes.

### 3.1 Light theme

| Token | Hex | Use |
|---|---|---|
| `bg` | `#FFFCF5` | page (warm white) |
| `cream` | `#FFF8E6` | warm sections, landing bands |
| `surface` | `#FFFFFF` | cards, sheets |
| `surface-2` / `surface-3` | `#F1F8F3` / `#DCEFE4` | sunken areas, inputs / hover, skeletons |
| `border-subtle` / `border-strong` | `#E1ECE5` / `#5F7D70` | dividers / control boundaries (≥ 3:1) |
| `text` / `text-2` / `text-3` | `#0B3D2E` / `#2F5547` / `#4C6C60` | deep green body, secondary, muted |
| `primary` (+ hover / pressed) | `#0B3D2E` (`#135443` / `#072A20`) | primary buttons, active states |
| `on-primary` | `#FFFFFF` | text on primary |
| `accent` / `accent-strong` | `#00A37A` / `#007A5A` | large shapes, icons, route line / accent text |
| `mint` / `mint-pale` | `#4DE3B4` / `#D9FCE7` | energy: indicators, highlights / tinted panels |
| `on-accent` | `#06231A` | text on accent or mint |
| `success`, `info`, `warning`, `danger` (+ `-bg`) | `#0B6E4F`, `#1C5D85`, `#6F5A00`, `#BE123C` | status, always with icon + text |
| `harissa` | `#C2410C` | LIVE and promo accents only |
| `focus` | `#00775A` | 2 px ring, 2 px offset |

### 3.2 Dark theme

Deep green night, not grey: `bg #05221A`, `surface #0A2D22`, `surface-2 #0F372A`, `surface-3 #164434`, `text #F1FBF6`, `primary #4DE3B4` with `on-primary #05221A`, `accent #00C994`, `focus #4DE3B4`. Dark mode keeps real (black) shadows.

### 3.3 Rules

- Text and primary buttons use deep green. `#00A37A` is for large shapes, icons and accents: white small text on it fails contrast.
- Mint is energy, never body text on light backgrounds.
- Status is never colour alone.
- The only gradients are photo scrims (`transparent → rgb(4 26 19 / .7)`) and the icon's wave; no decorative colour gradients.
- Theme follows the system; users can override. Both themes are designed, not inverted.

## 4. Typography

| Role | Latin | Arabic |
|---|---|---|
| Display / headlines | **Poppins** 700 | **IBM Plex Sans Arabic** 600 |
| UI / body | Poppins 400 / 500 / 600 | IBM Plex Sans Arabic 400 / 500 / 600 |
| Numbers | Poppins `tabular-nums` (prices, timers, ETAs, codes) | same, Latin digits |

Self-hosted with `next/font/local` (`apps/web/src/fonts/`), `font-display: swap`, subset by `unicode-range`. Big confident headlines, comfortable body.

| Token | Size / line |
|---|---|
| `display-xl` | 44/48 → 72/76, tracking −0.02em (landing) |
| `display` | 34/40 → 52/56 |
| `h1` / `h2` / `h3` | 28/34 · 22/28 · 18/24 |
| `body-lg` / `body` | 17/26 · 15/22 |
| `label` / `caption` / `micro` | 14/20 · 13/18 · 12/16 (micro uppercase in Latin only) |

Arabic: no letter-spacing, italics or uppercase; check headings never clip.

## 5. Space, shape, depth

- **Spacing:** 4/8 grid — 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 120. Page padding 16 on mobile, container 1200 px.
- **Radius:** controls and inputs `lg` 20, cards and sheets `xl` 28, chips and buttons `pill`. Small inner parts (skeleton lines, tiles inside cards) use `sm`/`md`. Nothing else.
- **Touch targets:** ≥ 44 px everywhere; customer primary buttons 52 px; restaurant and courier primary actions 56 px with ≥ 12 px gaps.
- **Depth:** soft layered shadows tinted deep green (`shadow-e1` cards, `e2` floating bars and toasts, `e3` sheets and dialogs). Cards separate by shadow, not borders.

## 6. Iconography and imagery

- **Icons:** one in-repo set (`packages/ui/src/icons.tsx`), 1.75 px stroke at 24 px, round caps. Mirror only directional icons in RTL.
- **Photos:** Wikimedia Commons, Unsplash or Pexels only, each viewed before use, converted to WebP, credited in `docs/PHOTO_CREDITS.md`. 4:3 cards, 1:1 thumbnails, 16:9 covers; explicit width and height; text over photos only with the scrim.
- **Empty states:** custom SVG illustrations in brand colours. No emoji as icons.
- **Content:** realistic names, dishes, DA prices and reviews everywhere.

## 7. Motion system

| Token | Value | Use |
|---|---|---|
| `fast` | 150 ms | press, toggles, colour feedback |
| `base` | 250 ms | most transitions |
| `slow` | 400 ms | sheets, page transitions, toasts |
| `ease-standard` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | everything by default |
| `spring-*` | CSS overshoot curves / Motion springs | playful moments only (stars, heart burst, cart count) |

Rules:
- Transform and opacity only. Press scale 0.97.
- View Transitions for page changes and shared elements (card photo → restaurant cover), with a plain fallback.
- Staggered list entrances (30 ms, first 8 items), skeleton shimmer, numbers that roll when they change.
- **Reduced motion:** everything off; at most a ≤ 120 ms fade.
- Restaurant and courier screens: nothing longer than `base` except a new order arriving.

### 7.1 Signature moments

1. **Landing:** full-screen Algeria photography with slow zoom and crossfade.
2. **Favourite:** heart burst on restaurant cards.
3. **Add to cart:** the Add button morphs into a quantity stepper; the cart bar slides up with an animated total.
4. **Place order:** the button morphs loading → success, then a full-screen celebration that transitions into tracking.
5. **Tracking:** the route line draws in, the scooter marker moves smoothly and rotates with its heading, ETA digits roll.
6. **Rating:** spring-animated stars.
7. **New order on the board:** pulse, sound and a countdown ring.

## 8. 3D (three.js via React Three Fiber; lazy and optional)

At most one scene in the product. It must animate by itself without scrolling, hold 60 fps on a mid-range phone, and fall back to photo motion (slow zoom and crossfade). It loads after LCP only with WebGL2, `deviceMemory ≥ 4`, `hardwareConcurrency ≥ 4`, no Save-Data and motion allowed; DPR capped at 1.25 mobile / 1.75 desktop; paused off-screen. If it is not excellent after a bounded effort (SPRINT lane B task 8), it is removed.

## 9. Map style (generated from tokens in `packages/geo`)

The AWID map uses cream land, pale-mint parks, deep-green labels and an `accent` route line; the table below is the lane A source until it is regenerated from the AWID tokens (docs/requests).

| Layer | Light | Dark |
|---|---|---|
| land | `#F4EEE4` | `#14110E` |
| urban landuse | `#EFE7DB` | `#181512` |
| water | `#BCD3DE` | `#0C1A22` |
| parks | `#DCE6CF` | `#13201A` |
| major roads / casing | `#FFFFFF` / `#E2D7C8` | `#2E2823` / `#221E1A` |
| minor roads | `#FBF8F3` | `#221E1A` |
| buildings / extrusion | `#E9E1D4` / `#E2D8CA` | `#1D1915` / `#26211C` |
| labels / halo | `#4A4239` / `#FBF8F3` | `#A79C8E` / `#0E0C0A` |
| route | gradient `primary → harissa`, 6 px with a 10 px soft glow | same, with stronger glow |
| driver marker | ink disc, saffron halo, bearing wedge | ivory disc, saffron halo |
| destination | saffron pin with an ink centre | same |

- Labels follow the UI language.
- POI clutter is hidden except landmarks useful for directions (mosques, schools, pharmacies, post offices).
- Fonts and glyphs are self-hosted, Arabic included.

## 10. Components (each with default, hover, pressed, focus-visible, disabled, loading, error and empty states where relevant)

- **Controls:** Button (primary, secondary, ghost, destructive; sizes 40/48/52/56), IconButton, Chip/FilterChip, SegmentedControl, Tabs (sliding indicator), Toggle, QuantityStepper.
- **Display:** PriceTag (handles RTL with `<bdi>`), Rating, Badge (LIVE, NEW, PROMO, SOLD OUT), Avatar, Skeleton (warm shimmer, off when reduced motion), EmptyState, ErrorState (retry), Toast (top, auto-dismiss 4 s, swipe away).
- **Overlays:** BottomSheet, Dialog.
- **Inputs:** TextField, PhoneInput (+213), OtpInput (6 boxes, paste, autofill), AddressCard, MapPinPicker, ImageCropper.
- **Cards and rows:** RestaurantCard (lg/sm), DishCard, MenuItemRow.
- **Order:** OptionGroup (radio/checkbox, min/max feedback), CartBar (sticky, shows count and total), StatusTimeline, OrderCard (board), CountdownRing, SlideToConfirm.
- **Data:** KpiTile, Heatmap, DataTable (sortable, keyboard).

A living style guide at `/[locale]/dev/design` (dev and test builds only) renders every component in every state, in both themes and directions. Visual tests screenshot it.

## 11. Screens (key layout notes)

### Customer

- **Home:**
  - header with the address chip (tap → address sheet) and an avatar;
  - large search field;
  - cuisine chips row;
  - sections as horizontal carousels (snap scrolling), with a vertical "All restaurants" list below;
  - Iftar banner in season;
  - sticky CartBar when the cart is not empty.
- **Search:** full-screen with instant results in two groups (Restaurants, Dishes). The filter sheet has live result counts.
- **Restaurant:**
  - cover with parallax collapsing into a compact header;
  - info row: rating · ETA · fee · min;
  - sticky category tabs; "Popular" grid; menu list;
  - CartBar.
- **Item sheet:** large photo, title, description, option groups, quantity, note, and a sticky "Add · total" button.
- **Cart → Checkout** (3 steps, CUS-12): a step indicator, editable summary cards, payment-at-door options, and "Paying with" quick amounts (exact, 2 000, 5 000, other).
- **Tracking:** the map takes the top 55%; a bottom sheet holds the timeline, ETA, delivery code (large monospaced digits), call buttons, help and a cancel button when allowed.
- **Orders, Profile, Addresses, Help, Legal:** simple, calm lists.

### Restaurant (tablet-first, also works on phones)

- **Board:**
  - columns with counts; a timer and countdown ring on each card;
  - a big Accept with prep-time chips;
  - top bar: open/busy switch, sound status, connection status.
- **Menu builder:**
  - left: categories (drag + keyboard);
  - centre: an item table with inline price edit;
  - right: an editor drawer;
  - "Preview as customer" toggle.
- **Zones:** full map with drawing tools, plus a side panel of fees.
- **Analytics:** KPI tiles, a line chart, the heatmap and the top-items table.

### Driver (phone)

- Job list. Active delivery: map with a big address block, call, navigate, cash box, and SlideToConfirm.

### Admin

- Dense, efficient tables and a live map. French and English only.

## 12. Voice and content

- **Tone:** warm, short, confident. French uses `vous` everywhere.
  - Arabic: Modern Standard Arabic in UI. Light Algerian touches only in marketing, reviewed by Mahdi.
  - Never cute in errors.
- **Prices:** `1 450 DA` / `1 450 دج`. Times: `19:30`. Ranges: `20–30 min` / `20–30 د`.
- **Error messages** say what happened and what to do: "This restaurant just closed. Schedule for tomorrow from 11:30?"
- **Example strings** (the i18n catalog must contain all three locales):

  | Key | fr | ar | en |
  |---|---|---|---|
  | `cart.cta` | Commander · {total} | اطلب · {total} | Order · {total} |
  | `checkout.confirm` | Confirmer la commande · {total} | تأكيد الطلب · {total} | Confirm order · {total} |
  | `tracking.onTheWay` | Votre commande est en route | طلبك في الطريق | Your order is on its way |
  | `home.notInArea` | Pas encore dans votre quartier | لسنا في منطقتك بعد | We're not in your area yet |
  | `iftar.countdown` | Iftar dans {time} | الإفطار بعد {time} | Iftar in {time} |

## 13. Accessibility

- WCAG 2.2 AA:
  - visible focus everywhere (never `outline: none` without a replacement);
  - logical tab order, including in RTL;
  - every icon button has a label;
  - live regions announce order status changes and cart total changes;
  - forms have labels and inline errors linked with `aria-describedby`.
- Text scales to 200% without horizontal scrolling at 360 px. Respect native dynamic type.
- No information in colour alone. No time limits for customers; restaurant countdowns are informational.

## 14. Design QA (the `design_critic` agent runs this at every UI gate)

1. **Screenshot matrix** for every changed screen, stored as compressed WebP in `docs/evidence/mN/`:
   - light and dark;
   - `ar`, `fr` (and the pseudo-locale in CI);
   - 390×844, 768×1024, 1280×800.
2. **Checklist:**
   - only tokens are used;
   - nothing is truncated or overflowing;
   - the RTL mirror is correct;
   - prices are formatted right;
   - targets meet the minimums;
   - there is a clear visual hierarchy (one primary action per view);
   - empty, loading and error states exist;
   - photos have no layout shift;
   - motion follows the tokens and respects reduced motion.
3. **Taste check against §1:**
   - Does it look calm and expensive?
   - Does the food dominate?
   - Is there anything a premium brand would remove?

   Remove it.
4. **Output:** a numbered list of concrete fixes (file, element, change). No vague advice.
