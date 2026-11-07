# DESIGN — "Casbah Saffron"

The product should feel like a beautiful, calm, expensive restaurant menu that happens to be the fastest app on the phone. The reference is not "another delivery app". It is editorial food magazines, premium hospitality brands, and the light of Algiers at golden hour: white Casbah walls, the Mediterranean, saffron and harissa.

## 1. Principles

1. **Let the food be the colour.** The UI is warm ivory and ink; photos bring the colour. One saffron accent marks the next action.
2. **Calm luxury.** Generous space, big editorial headlines, few borders, soft depth. No clutter, no shouting badges, no rainbow categories.
3. **Fast is a feature.** Every animation explains a change or confirms an action, and never blocks input. Low-end Android over 4G is our default device.
4. **Local, not generic.** Arabic is a first-class layout, not a mirrored afterthought. Prices look like Algerian prices (`1 450 DA`). Ramadan and iftar are part of the product.
5. **One hand, one thumb.** Primary actions sit in the bottom third on mobile. Restaurant and driver screens use big targets for busy, greasy or gloved hands.

## 2. Why these colours (research summary)

- Findings that red "increases appetite" and blue "suppresses" it are **inconsistent**. Studies on food colour and plate colour disagree, and the red-plate effect did not hold up in a replication. So we don't pick colours for "appetite psychology". We pick them for contrast, distinctiveness and cultural fit, and we let real food photos do the appetite work.
- The main local competitor owns **purple**. Global delivery brands own red, orange, green and teal. **Ink + ivory + saffron-gold** is unused in this market, reads premium, and is rooted in Maghreb cooking.
- Every pair below was **checked against WCAG 2.2**: body text ≥ 7:1, all other text ≥ 4.5:1, UI boundaries and focus rings ≥ 3:1. `packages/tokens` must contain a unit test that recomputes these ratios, so a later colour tweak can't silently break accessibility.

## 3. Colour tokens

Names are semantic in code (`--color-primary`), brand names are for humans.

### 3.1 Light theme

| Token | Hex | OKLCH | Brand name | Use |
|---|---|---|---|---|
| `bg` | `#FBF8F3` | 98.0% 0.007 80.7 | Casbah ivory | page background |
| `surface` | `#FFFFFF` | 100% 0 0 | — | cards, sheets |
| `surface-2` | `#F4EEE4` | 95.1% 0.015 80.7 | Sand | sunken areas, chips, inputs |
| `surface-3` | `#EAE2D6` | 91.6% 0.018 78.2 | Dune | hover on sand, skeletons |
| `border-subtle` | `#E4DACC` | 89.3% 0.022 76.5 | — | dividers (decorative only) |
| `border-strong` | `#8A7F72` | 60.3% 0.023 72.0 | — | input and control boundaries (3.7:1) |
| `text` | `#16130F` | 18.9% 0.009 75.1 | Ink | body and headlines (17.5:1) |
| `text-2` | `#4A4239` | 38.4% 0.018 70.5 | — | secondary text (9.3:1) |
| `text-3` | `#675D52` | 48.5% 0.021 69.9 | — | muted text, placeholders (6.1:1) |
| `primary` | `#F29E1F` | 76.6% 0.159 69.9 | Saffron | primary buttons, active indicators, route line |
| `primary-hover` | `#F6AE3E` | 80.1% 0.148 74.1 | — | hover |
| `primary-pressed` | `#DD8A0C` | 70.4% 0.153 67.5 | — | pressed |
| `on-primary` | `#16130F` | — | Ink | text and icons on saffron (8.5:1) |
| `harissa` | `#C2410C` | 55.3% 0.174 38.4 | Harissa | LIVE, promo and "new order" accents (sparingly) |
| `on-harissa` | `#FFFFFF` | — | — | text on harissa (5.2:1) |
| `harissa-text` | `#B93E0B` | 53.5% 0.167 38.5 | — | harissa-coloured text (5.3:1) |
| `info` / `info-bg` | `#1C5D85` / `#E6F0F6` | 45.8% 0.091 240.5 | Mediterranean | info, focus ring, map water accents |
| `success` / `success-bg` | `#1E7146` / `#E5F2EA` | 48.8% 0.105 156.0 | Cedar | success, "open", free delivery |
| `warning` / `warning-bg` | `#6F5A00` / `#F7F0D0` | 47.5% 0.097 93.0 | Mustard | warnings (always with an icon) |
| `danger` / `danger-bg` | `#BE123C` / `#FCE8EC` | 51.4% 0.198 16.9 | Crimson | errors, destructive actions |
| `focus` | `#1C5D85` | — | — | 2 px focus ring + 2 px offset in `bg` |
| `link` | `#16130F` | — | — | link text, with a 2 px saffron underline (offset 3 px) |
| `scrim` | `rgb(14 12 10 / 0.55)` | — | — | behind sheets and dialogs |

### 3.2 Dark theme

| Token | Hex | OKLCH | Use |
|---|---|---|---|
| `bg` | `#0E0C0A` | 15.6% 0.005 67.4 | page |
| `surface` | `#171411` | 19.4% 0.008 67.3 | cards |
| `surface-2` | `#201C18` | 23.0% 0.010 67.3 | raised, inputs |
| `surface-3` | `#2A2520` | 26.8% 0.012 67.3 | hover, skeleton |
| `border-subtle` | `#2E2823` | 28.2% 0.013 62.1 | dividers |
| `border-strong` | `#7A7064` | 55.1% 0.022 72.4 | control boundaries (4.0:1) |
| `text` | `#F6F0E7` | 95.7% 0.014 78.3 | body (17.2:1) |
| `text-2` | `#D3C9BC` | 84.0% 0.021 74.6 | secondary (12.0:1) |
| `text-3` | `#A79C8E` | 69.8% 0.024 74.0 | muted (7.2:1) |
| `primary` | `#F5AA35` | 79.2% 0.152 73.3 | primary |
| `primary-hover` | `#F8BA5A` | 82.8% 0.133 75.9 | hover |
| `primary-pressed` | `#E5961C` | 73.6% 0.152 70.4 | pressed |
| `on-primary` | `#16130F` | — | 9.4:1 |
| `harissa` / `on-harissa` | `#FF7A3D` / `#16130F` | 72.6% 0.178 43.2 | 7.1:1 |
| `harissa-text` | `#FF8A55` | 75.2% 0.157 44.0 | 8.4:1 |
| `info` / `info-bg` | `#6DB3DD` / `#10222E` | 73.7% 0.093 236.3 | |
| `success` / `success-bg` | `#5BC48A` / `#0F2419` | 74.3% 0.130 156.9 | |
| `warning` / `warning-bg` | `#E8CF5C` / `#262009` | 85.4% 0.137 97.1 | |
| `danger` / `danger-bg` | `#FF6F8E` / `#2E1219` | 72.4% 0.177 9.3 | |
| `focus` | `#6DB3DD` | — | |
| `link` | `#F7B955` | 82.5% 0.136 76.7 | link text in dark (11.2:1) |

### 3.3 Contrast pairs the token test must check (both themes)

| Foreground | Background(s) | Minimum ratio |
|---|---|---|
| `text` | `bg`, `surface`, `surface-2` | 7 |
| `text-2`, `text-3` | `bg`, `surface`, `surface-2` | 4.5 |
| `on-primary` | `primary`, `primary-hover`, `primary-pressed` | 4.5 |
| `on-harissa` | `harissa` | 4.5 |
| `harissa-text`, `info`, `success`, `warning`, `danger` | `bg` | 4.5 |
| `info`, `success`, `warning`, `danger` | their own `-bg` | 4.5 |
| `link` | `bg`, `surface` | 4.5 |
| `danger` | `surface` | 4.5 |
| `border-strong`, `focus` | `bg`, `surface` | 3 |

### 3.4 Rules

- Saffron is never used for text on light backgrounds (only 2:1). Links are ink with a saffron underline.
- Harissa is an accent, not a second brand colour: max one harissa element per screen region (LIVE pill, promo tag, new-order glow).
- Status is never colour alone: always icon + text.
- Theme follows the system by default, and users can override it. Both themes are designed screens, not inverted ones.
- Gradients: the "golden hour" gradient `#F6AE3E → #C2410C → #2A1E14` appears only in the landing hero and the 3D sky. The route line is `primary → harissa`.

## 4. Typography

| Role | Latin | Arabic |
|---|---|---|
| Display / headlines | **Fraunces** (variable, soft optical serif), 600 | **Noto Naskh Arabic** (variable), 600–700 |
| UI / body | **Inter** (variable) | **IBM Plex Sans Arabic** 400 / 500 / 600 |
| Numbers | Inter with `tabular-nums` for prices, timers, ETAs and codes, in every locale | same (Latin digits) |

Self-host every font with `next/font/local`. Subset by script with `unicode-range` and use `font-display: swap`. Preload only the UI font of the current locale. No Google Fonts CDN at runtime.

Scale (mobile → desktop via `clamp`):

| Token | Size / line | Font |
|---|---|---|
| `display-xl` | 44/48 → 72/76, tracking −0.02em | display (landing only) |
| `display` | 34/40 → 52/56 | display |
| `h1` | 28/34 | display |
| `h2` | 22/28 | UI 600 |
| `h3` | 18/24 | UI 600 |
| `body-lg` | 17/26 | UI 400 |
| `body` | 15/22 | UI 400 |
| `label` | 14/20 | UI 500 |
| `caption` | 13/18 | UI 500 |
| `micro` | 12/16 | UI 600, uppercase with +0.04em in Latin only |

Arabic adjustments:
- +1 px on `body`, `label` and `caption`; +15% line-height.
- No letter-spacing, no italics, no uppercase.
- Check that Arabic headings never clip ascenders or descenders.

## 5. Space, shape, depth

- **Spacing** (4 px base): 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 120. Mobile page padding 16 (20 from 400 px wide). Desktop container 1200 px. The restaurant board is full width.
- **Radius:** `xs` 6, `sm` 10, `md` 14 (buttons, inputs), `lg` 20 (cards), `xl` 28 (sheets, top corners), `pill` 999 (chips).
- **Touch targets:**
  - minimum 44×44 everywhere;
  - customer primary buttons 52 px tall;
  - restaurant and driver primary actions 56 px with ≥ 12 px gaps.
- **Elevation (light):**
  - `e1`: `0 1px 2px rgb(22 19 15 / .06)`
  - `e2`: `0 1px 2px rgb(22 19 15 / .05), 0 8px 24px rgb(22 19 15 / .08)`
  - `e3`: `0 2px 6px rgb(22 19 15 / .06), 0 24px 48px rgb(22 19 15 / .14)` — sheets and dialogs only
- **Elevation (dark):** no shadows. Raise with `surface-2`/`surface-3` plus a 1 px `border-subtle`.
- **Materials:**
  - Glass (backdrop blur 16 px, `bg` at 72% opacity): sticky headers and the bottom bar only, and only when `backdrop-filter` is supported and not in low-data mode. Otherwise solid.
  - Film grain: an SVG noise overlay at 3% opacity on the landing hero only.

## 6. Iconography and imagery

- **Icons:**
  - Lucide, 1.75 px stroke at 24 px, round caps.
  - Mirror in RTL only icons that imply direction: back, forward, chevrons, arrows, send.
  - Never mirror checkmarks, clocks, media or brand marks.
- **Cuisine chips:** original duotone line icons (ink + saffron) drawn as SVG in-repo:
  - tacos, pizza, shawarma, burger, traditional (couscous/tagine), grill, fish, sandwiches/mhadjeb, pastry, juice and coffee, healthy, Asian;
  - seasonal: zlabia and qalb el louz, for Ramadan.
- **Food photos:**
  - 4:3 on cards and item sheets, 1:1 thumbnails, 16:9 restaurant covers.
  - Thumbhash placeholder, then a fade-in over 180 ms. Explicit width and height (no layout shift).
  - Text over photos only with a bottom ink gradient (`transparent → rgb(14 12 10 / .7)`).
- **Restaurant photo guide** (shown in the uploader):
  - natural light, 45° or top-down, no text on the image, no stock photos they don't own;
  - the cropper enforces the ratio and a focal point.
- **Demo data:** placeholder images are generated (gradient + dish icon + name). Never use web photos.
- **Logo (working):** wordmark "Zaafran / زعفران" in the display font with a saffron dot. Original, replaceable via `brand.ts`.

## 7. Motion system

Motion must feel physical, quick and quiet. Library: `motion/react` on web, Reanimated 4 on native, with the same tokens.

| Token | Value | Use |
|---|---|---|
| `instant` | 80 ms | colour/opacity feedback |
| `fast` | 140 ms | pressed states, toggles |
| `base` | 220 ms | most transitions |
| `slow` | 320 ms | sheets, page transitions |
| `emphasis` | 480 ms | success moments |
| `scene` | 900–1 400 ms | signature moments only |
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | default |
| `ease-decelerate` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | entering |
| `ease-accelerate` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | exiting |
| `spring-snappy` | stiffness 520, damping 34 | buttons, chips, tab indicator |
| `spring-gentle` | stiffness 260, damping 28 | sheets, cards, map pin |
| `spring-bouncy` | stiffness 380, damping 18 | celebrations only |

Rules:
- **Press feedback:** scale 0.98 and darken over `fast`. No ripple.
- **Lists:** stagger 30 ms, at most the first 8 items; the rest appear instantly.
- **Navigation:** shared-element continuity. A restaurant card expands into the restaurant header and an item thumbnail into the item sheet (Motion `layoutId`, or the View Transitions API where supported).
- **Bottom sheets:** drag with velocity, rubber-band past the bounds, snap points (35% / 90%).
- **Numbers that change** (cart total, ETA) roll like an odometer using tabular digits.
- **Reduced motion:** replace movement with a ≤ 120 ms opacity fade. Turn off parallax, 3D auto-motion, camera flights (jump instead), steam, confetti and odometers.
- **Restaurant and driver screens:** efficiency first. Nothing longer than `base` except the new-order arrival.

### 7.1 Signature moments (the "wow")

1. **Landing hero — "Casbah at golden hour"** (§8.1).
2. **Address pin drop:**
   - the map tilts gently into 3D;
   - the pin "lands" with `spring-gentle` and a saffron ripple;
   - the accuracy circle breathes once.
3. **Add to cart:**
   - the item thumbnail arcs into the cart button along a curved path (~420 ms);
   - the cart count springs;
   - haptic tick on native.
4. **Order confirmed — "the tagine":**
   - a 3D tagine lid lifts and saffron steam rises (1.2–1.4 s);
   - then the scene dissolves into the tracking screen.
5. **Tracking:**
   - the camera follows the driver with eased pitch and bearing;
   - the route line draws progressively;
   - ETA digits roll;
   - the LIVE pill pulses (harissa).
6. **New order on the board:**
   - the card drops in with `spring-snappy`;
   - a saffron glow pulses until acknowledged;
   - a countdown ring shows the time left to accept.
7. **Iftar countdown (Ramadan):**
   - a slim banner with a softly glowing lantern line icon and a live countdown to Maghrib;
   - the dark theme's warmth increases slightly after Maghrib.
8. **Restaurant pitch calculator** (`/restaurants`):
   - sliders for orders/day and average ticket;
   - animated bars compare "typical commission app (20–30%)" with "Zaafran: 5 000 DA / month".

## 8. 3D (three.js via React Three Fiber; lazy and optional)

### 8.1 Hero — "Casbah at golden hour"

- **Scene (fully procedural; no downloaded models):**
  - a terraced hillside from seeded noise;
  - 1 500–2 500 **instanced** white cubic houses with slight size, rotation and tone variation;
  - a few generic domes and a slender tower silhouette (generic, not a copy of a real skyline);
  - the sea as a plane with a cheap fresnel and sun-glint shader;
  - a gradient sky with a low sun;
  - warm directional light plus hemisphere light;
  - fake ambient occlusion through darker vertex colours at house bases.
- **Story:**
  - a saffron light trail (shader-animated tube along a Catmull-Rom curve over the roofs) travels from a "kitchen" to a "home";
  - scrolling scrubs time from golden hour to blue hour;
  - window lights (emissive instances) fade in — dinner time, iftar time.
- **Interaction:** pointer parallax (±3°), slow idle drift. Tapping the home pin focuses the address field.
- **Budgets and fallbacks:**
  - the 3D chunk is loaded with `requestIdleCallback` after LCP;
  - only when WebGL2 is available, `deviceMemory ≥ 4` (or unknown) and `hardwareConcurrency ≥ 4`, there is no Save-Data, and reduced motion is off;
  - DPR capped at 1.25 on mobile and 1.75 on desktop;
  - shadows on desktop only (one 1024 map);
  - `frameloop="demand"` when idle; paused when off-screen or the tab is hidden;
  - target 60 fps on a mid-range phone, never below 45;
  - the fallback is an AVIF poster rendered from the same scene in CI (Playwright canvas screenshot), so the static and 3D versions match.

### 8.2 Order confirmed — "the tagine"

- `LatheGeometry` base and conical lid with a glazed terracotta material (harissa and saffron tints).
- The lid lifts on `spring-bouncy`; ~60 instanced steam sprites rise.
- The canvas mounts only for this moment and is disposed after it. Fallback: SVG + Motion version.

### 8.3 Native

Re-create 8.2 with React Three Fiber native only if it holds ≥ 55 fps on the test Android. Otherwise use a pre-rendered video (≤ 600 KB) or Lottie. The hero is web-only.

## 9. Map style (generated from tokens in `packages/geo`)

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
