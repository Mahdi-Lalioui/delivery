# SPEC — Zaafran (working name)

What to build, how it behaves, and the rules it must follow. Every line with an ID (`CUS-07`, `ORD-03`…) is an **acceptance criterion**: at least one automated test must carry that ID in its name (`pnpm trace` enforces this). If something here is ambiguous, choose the simplest reading that keeps the user safe and the money right. Record the choice in `docs/DECISIONS.md`.

---

## 0. Context and hard constraints

- **Market.** We start in Algiers (wilaya 16) and expand city by city (Sétif, Béjaïa, Constantine, Oran…). Cash on delivery dominates Algerian e-commerce. The main competitor is Yassir, a purple-branded super-app. Card rails are EDAHABIA (Algérie Poste) and CIB (SATIM). Chargily Pay is a developer gateway for both.
- **Business model.**
  - Restaurants pay a **flat monthly subscription**: default **5 000 DZD**, a setting. The **first month is free** and there is **0% commission**.
  - Customers pay menu prices plus the restaurant's delivery fee. The platform takes no fee from customers.
- **Delivery.**
  - v1: restaurants deliver with **their own drivers**. These drivers use our courier tools, so customers still get live tracking.
  - Phase 2 adds our own riders and dispatch. Design for it now (§22), don't build it.
- **Season.** Ramadan 1448 is expected to start around **8 February 2027** (moon sighting may move it a day). Iftar and suhoor peaks are the first big test. The web app must be live and stable before then.
- **Languages.** Arabic (RTL, `ar-DZ`), French (`fr-DZ`), English (`en`).
- **Law (Algeria).** The product must satisfy these articles. The human paperwork is in HUMAN_TODO.

  | Text | Requirement |
  |---|---|
  | Law 18-05 Art. 3 | no online sale of gambling, alcohol, tobacco, pharmaceutical products, IP-infringing goods, or anything prohibited |
  | Law 18-05 Art. 8 | commercial registration (CNRC), and the site is hosted in Algeria on `.com.dz` |
  | Law 18-05 Art. 11 | the offer must be clear and readable |
  | Law 18-05 Art. 12 | ordering takes three steps: terms shown → order reviewed and editable → explicit confirmation |
  | Law 18-05 Art. 25 | transaction records are kept |
  | Law 18-05 Art. 26 | collect only the personal data needed |
  | Law 18-07 | personal-data protection (ANPDP) |

## 1. Surfaces and roles

| Surface | Users | Tech | Milestone |
|---|---|---|---|
| Customer web (PWA) `/[locale]/…` | customers | Next.js | M3–M6 |
| Restaurant dashboard `/[locale]/business/…` | merchant owner / manager / staff | Next.js, tablet-first | M2–M7 |
| Courier web (PWA) `/[locale]/courier/…` | restaurant drivers | Next.js | M5 |
| Admin console `/admin/…` (fr + en only) | Mahdi | Next.js | M7 |
| Landing `/[locale]` and `/[locale]/restaurants` (merchant pitch) | everyone | Next.js + three.js | M8 |
| Customer app | customers | Expo (iOS, Android) | M10 |
| Partner app (restaurant + courier modes) | merchants, drivers | Expo | M11 |

Roles: `customer`, `merchant_owner`, `merchant_manager`, `merchant_staff`, `courier`, `admin`. One user (one phone number) can hold several roles.

## 2. Features and acceptance criteria

### 2.1 Customer (web, then app)

- **CUS-01** Home, search and restaurant pages work without an account. Login is required only at checkout, orders and profile.
- **CUS-02** On first visit the app asks where to deliver: GPS, search a neighbourhood/commune, or pick on a map. The choice is stored locally.
  - Outside every service area: show "We're not in your area yet", offer an opt-in to be notified, and disable ordering (browsing stays allowed).
- **CUS-03** Home sections, shown only when not empty:
  - Order again (logged-in users with history)
  - Near you (≤ 4 km, sorted by ETA)
  - Free delivery
  - Top rated (Bayesian average ≥ 4.3 and ≥ 10 ratings)
  - New (activated ≤ 30 days ago)
  - Seasonal (Iftar / Ramadan when the flag is on)
  - A row of cuisine chips

  Closed restaurants come after open ones and show "Opens at 18:00 · Schedule".
- **CUS-04** A restaurant card shows:
  - cover, logo, name (current locale, with fallback)
  - rating and count, ETA range "20–30 min"
  - delivery fee or "Free delivery", and min order if > 0
  - open state and pay-at-door icons
- **CUS-05** Search:
  - debounced 150 ms; returns restaurants and dishes;
  - works in Arabic, French, English and Arabizi (§6);
  - the empty state suggests popular searches;
  - the last 10 searches are stored locally and can be cleared.
- **CUS-06** Filters:
  - open now; rating ≥ 4; free delivery; max ETA (≤ 20 / ≤ 30 / ≤ 45);
  - price level; cuisine; accepts Baridi Pay QR; accepts card terminal (TPE).

  The feed supports delivery or pickup, opening at a future instant, and restaurants with an orderable vegetarian dish. Pickup cards carry the restaurant pin. Distances based on a commune centroid are approximate.

  Sorts: relevance, distance, rating, ETA, delivery fee. Filters live in the URL.
- **CUS-07** Restaurant page:
  - cover with gentle parallax;
  - info sheet: address, today's hours plus the week, distance, min order, fee rules, pay-at-door options, legal name;
  - sticky category tabs with scroll-spy;
  - "Popular": the top 6 by orders in the last 30 days;
  - menu items: sold-out items are greyed, labelled "Sold out" and cannot be added;
  - reviews summary: average, count, latest 5.
- **CUS-08** Item sheet:
  - photo, name, description, price;
  - option groups follow min/max rules: a required group blocks "Add" until it is satisfied, max is enforced, and max = 1 renders as radio buttons;
  - option deltas are shown as "+50 DA";
  - quantity 1–20; a note to the kitchen of ≤ 140 chars;
  - the total updates live, and the CTA reads "Add · 1 450 DA".
- **CUS-09** Cart:
  - one restaurant per cart; adding from another restaurant asks "Start a new cart?";
  - persists locally for 7 days;
  - edit quantities, remove lines;
  - progress to the minimum order: "Add 300 DA to reach the minimum";
  - an upsell row: up to 4 featured items not already in the cart.
- **CUS-10** Phone or email OTP login:
  - Algerian mobiles only in v1 (`+213 5|6|7…`). Accepts `0550…`, `+213550…` and `00213550…`, and displays `0550 12 34 56`.
  - Offer only the enabled phone and email methods. Trim and lowercase email addresses. Use a six-digit code with paste, one-time-code autofill and a 45 s resend countdown.
  - Distinct errors for wrong code, expired code and too many attempts, without revealing whether the phone or email has an account.
- **CUS-11** Addresses:
  - add one by GPS, map pin or search;
  - fields: label, building/residence, floor, apartment, landmark, instructions, and an optional voice note ≤ 20 s;
  - must be inside a service area;
  - shows its plus code; editable; one default.
- **CUS-12** Checkout is **three steps** (Law 18-05 Art. 12):
  1. details, with the terms link visible;
  2. review: full price breakdown with edit links for items, address, time and payment;
  3. an explicit button "Confirm order · 2 150 DA".

  Use the account’s verified phone as the contact number. If the account has no verified phone, ask for an Algerian mobile number for this order. This number is unverified and can be used by the restaurant or assigned courier to call about the order. Placement requires a reachable contact phone and a verified account identifier. The unverified order contact stays separate from account sign-in and notifications. The first-order cash cap still applies.

  No order exists before step 3.
- **CUS-13** Timing and fulfilment:
  - delivery or pickup (if the restaurant offers it);
  - ASAP or scheduled: 15-min slots inside opening hours, up to 3 days ahead;
  - during Ramadan, an "Iftar" quick slot that targets arrival at Maghrib for the delivery location (§5).
- **CUS-14** Pay at the door:
  - cash is the default; Baridi Pay QR or card terminal if the restaurant enabled them;
  - cash has a "Paying with" amount (≥ total, ≤ total + 10 000 DA) so the driver brings change;
  - online payment is hidden unless the `online_payments` flag is on.
- **CUS-15** Ordering for someone else:
  - recipient name + phone (validated);
  - the recipient gets the delivery code by SMS, plus a tracking link if the sender opts in.
- **CUS-16** Promo codes are checked at quote time, with precise errors: expired, below minimum, used up, wrong restaurant.
- **CUS-17** If the quote expired (10 min) or a price changed, show the difference and ask again. Never charge an amount the customer did not see.
- **CUS-18** Tracking:
  - timeline Placed → Accepted → Preparing → Ready → On the way → Delivered, with times;
  - a live ETA range; a live map once out for delivery: smooth courier marker, route line, destination pin;
  - buttons to call the restaurant and the driver; the 4-digit delivery code is visible;
  - a share link: read-only, shows first name only, expires 24 h after delivery.
- **CUS-19** The customer can cancel in `scheduled` or `pending_acceptance` with one tap and a reason. After that the screen shows "Call the restaurant".
- **CUS-20** Push notifications for accepted, ready (pickup), on the way, delivered, rejected, expired and cancelled. For order status delivery, prefer push. If push is unavailable, use the verified phone by SMS, or the verified email when there is no verified phone.
- **CUS-21** Order history:
  - status, plus a receipt (view/print) with restaurant, items, options, prices, fees, totals, date and code;
  - reorder in 2 taps: unavailable items are flagged and changed prices shown. Completed orders at public restaurants carry the current restaurant slug. The reorder response also includes the current menu revision.
- **CUS-22** Rating after delivery or pickup, in-app and by push 30 min later:
  - food 1–5 stars, delivery 1–5 stars (delivery orders only), comment ≤ 500 chars;
  - editable for 24 h; the restaurant's reply is visible.
- **CUS-23** Favourite restaurants: a heart on cards and pages, plus a list in the profile.
- **CUS-24** Profile:
  - name; verified phone and email with Add or Change actions that require an OTP to the new identifier; language; theme (system/light/dark); low-data mode; notifications; addresses;
  - privacy: export my data (JSON), delete my account;
  - help: FAQ, plus a contact form linked to an order;
  - legal pages.
- **CUS-25** PWA:
  - installable (manifest, maskable icons, splash);
  - offline page; caches the shell and the last 5 viewed menus;
  - web push; on iOS, show install guidance first, since push requires home-screen install.
- **CUS-26** Low-data mode turns on automatically with `Save-Data`/`navigator.connection.saveData`. It means smaller images, no 3D or autoplay, and the map loads only on tap.
- **CUS-27** Every restaurant has a link-in-bio page `/[locale]/r/[slug]` with a generated Open Graph image (cover, name, rating), so restaurants can send their own Instagram/Facebook customers to order.
- **CUS-28** Accessibility: the whole order path works with keyboard and screen reader; text scales to 200% without loss.

### 2.2 Restaurant dashboard (tablet-first web, later the partner app)

- **MER-01** Public signup:
  - fields: restaurant name, owner name, phone (OTP), commune, address pin, cuisine, RC number (optional at signup), photos (optional);
  - result: status `pending_review`, and the admin is notified.
- **MER-02** After approval, an onboarding checklist:
  - profile, hours, menu (≥ 5 items), delivery zone;
  - "send a test order" (MER-25), then "Go live".

  Going live sets the status to `active` and starts the free month.
- **MER-03** Live board:
  - columns New / Preparing / Ready / On the way / Done today;
  - a new order animates in and plays a looping sound until a staff member taps it;
  - screen wake lock; count in the tab title; web push;
  - when offline, a banner shows; on reconnect it **replays missed events** so no order is ever lost (an e2e test cuts the network).
- **MER-04** Accept with a prep time (chips 10/15/20/30/45 or custom 5–120 min). Reject with a reason: closed, too busy, item unavailable (pick the items to mark sold out), other.
- **MER-05** Escalation for an order nobody answers:

  | After | Action |
  |---|---|
  | 2 min | push again, louder sound |
  | 3 min | SMS to the restaurant's backup phone |
  | 8 min | auto-expire, notify the customer with an apology, record the metric |

  All times are settings.
- **MER-06** Busy mode pauses new orders for 15/30/60 min or until reopened. Customers see "Busy · back at 20:15". It resumes automatically.
- **MER-07** Order detail:
  - items, options and notes;
  - customer first name and phone (call button);
  - address details, map and voice note; payment method and change; timeline;
  - prints a kitchen ticket (80 mm thermal CSS, Arabic and French).
- **MER-08** Own drivers:
  - invite by phone (SMS link); list; activate/deactivate;
  - assign a driver manually, or auto-assign when exactly one driver is online;
  - see live positions on active orders.
- **MER-09** Menu builder:
  - Categories: create, rename, reorder by drag *and* keyboard; optional availability window (e.g. 07:00–11:00).
  - Item editor:
    - name and description in ar and/or fr (at least one; en optional);
    - integer DZD price with a "DA" suffix; photo;
    - tags: spicy, vegetarian, new, popular; extra prep minutes.
  - Duplicate, archive (soft delete), and a one-tap sold-out toggle in the list and on the board (until end of day, or indefinitely).
- **MER-10** Option-group library:
  - define a group once (e.g. "Sauces", min 0 / max 2) and attach it to many items, ordered per item;
  - options have a price delta ≥ 0, a default selection, and a per-option sold-out flag.
- **MER-11** Bulk price change:
  - select items or a category; apply +/− % or a fixed DA amount;
  - rounds to the nearest 10 DA (configurable to 1/5/10/50);
  - preview table old → new, applied in one transaction;
  - price history is recorded; undo within 10 min.
- **MER-12** Menu import from CSV/XLSX:
  - download a template; upload gives a validation report (row, field, reason), then a preview, then apply;
  - idempotent by external key.
- **MER-13** Menu import from photos (flag `menu_photo_import`):
  - 1–5 photos of a paper menu go to the LLM vision adapter, which produces a **draft** of categories, items and prices;
  - the merchant reviews and edits it; every price is highlighted for confirmation;
  - never auto-published; works for Arabic and French menus.
- **MER-14** Photo upload:
  - JPG/PNG/HEIC/WebP ≤ 8 MB;
  - in-browser crop with a focal point: 4:3 items, 16:9 cover, 1:1 logo;
  - the server re-encodes AVIF and WebP at widths 160/320/640/960/1280, adds a thumbhash, and strips metadata.
- **MER-15** Opening hours:
  - several ranges per day (11:30–15:00, 18:00–23:30); ranges across midnight (18:00–02:00);
  - special dates (closed or different hours); a "closed now" override.
- **MER-16** Ramadan schedule:
  - each day's hours relative to Maghrib (e.g. open at Maghrib − 60 min, close at 02:00), plus a suhoor window;
  - uses prayer times for the restaurant's location (`adhan`, configurable method, plus a manual ± minutes adjustment);
  - 7-day preview.
- **MER-17** Delivery settings:
  - modes: delivery and/or pickup;
  - zones: draw a polygon (vertex editing) or set a radius in km;
  - per zone: base fee, per-km fee, free-delivery threshold, min order, max distance, extra ETA minutes;
  - no zone = no delivery.
- **MER-18** Pay at the door: cash (always on), Baridi Pay QR, card terminal (TPE).
- **MER-19** Promotions:
  - code or automatic;
  - types: percent (with a DZD cap), fixed DZD, free delivery;
  - conditions: min subtotal, dates, days/hours, first order only, max uses in total and per customer;
  - a worked example in the editor, and stats (uses, sales).
- **MER-20** Reviews: list, filter by stars, one reply per review (editable for 24 h), report abuse to the admin.
- **MER-21** Analytics with a date range:
  - orders, sales, average ticket, acceptance rate;
  - average prep time and delivery time; cancellations by reason;
  - top items; a weekday × hour heatmap; repeat-customer %;
  - CSV export.
- **MER-22** Billing:
  - plan status (trial end, next invoice) and invoices (PDF);
  - pay by uploading proof of a CCP/BaridiMob transfer (photo + reference), or online through Chargily when the `subscription_online_payment` flag is on;
  - banners for due, past due and suspended.
- **MER-23** Staff roles, invited by phone:
  - owner: everything;
  - manager: everything except billing and staff;
  - staff: board and sold-out toggles only.
- **MER-24** Shareables: a QR code, the link-in-bio page, and a printable A5/A4 poster (ar/fr) with the name and QR.
- **MER-25** Test order: a fake order only the merchant sees, for rehearsal. It is marked TEST and excluded from analytics, billing and customer notifications.

### 2.3 Courier (restaurant's own driver; web PWA in M5, partner app in M11)

- **COU-01** The driver logs in by OTP after being invited, and belongs to one restaurant in v1.
- **COU-02** Online/offline toggle. The list of assigned jobs shows pickup, drop-off and cash to collect.
- **COU-03** Active delivery:
  - two steps (Pickup → Drop-off) with big slide-to-confirm buttons (56 px tall);
  - navigation buttons (Google Maps, Waze, Apple Maps on iOS) open the **exact lat,lng**;
  - shows customer first name, a call button, address details, landmark, the voice-note player and the plus code.
- **COU-04** Location during an active delivery:
  - sent every 5 s or every 20 m, whichever is later; points with accuracy > 100 m are dropped;
  - batched while offline;
  - foreground on the web (with a keep-screen-on prompt), background in the partner app.
- **COU-05** "Delivered" requires the recipient's 4-digit code. The fallback "Can't get the code" requires a photo plus a reason, and is flagged for the restaurant.
- **COU-06** Failed delivery: call attempts are logged; after a 10-min wait the driver may mark it failed with a reason. The customer and restaurant are notified.
- **COU-07** Cash: the screen shows the amount to collect and the change to give.

### 2.4 Admin console (Mahdi)

- **ADM-01** Login by OTP plus mandatory TOTP. 12 h sessions. Every write is audited.
- **ADM-02** Dashboard:
  - live map of active orders;
  - today: orders, sales, acceptance rate, average prep and delivery times, cancellations by reason;
  - restaurants not responding, error rate, job backlog.
- **ADM-03** Restaurant review queue: approve or reject with a reason; edit; suspend/reactivate; read-only "view as restaurant".
- **ADM-04** Prohibited-goods moderation (§17.3): flagged items stay unpublished until reviewed.
- **ADM-05** Orders: search by code, phone or restaurant; timeline; force cancel or complete with a reason.
- **ADM-06** Users: search, block/unblock with a reason, delete (anonymise) on request.
- **ADM-07** Billing:
  - subscriptions; invoices (issue, void with a reason);
  - record payments (cash/CCP/BaridiMob/Chargily) with reference and proof;
  - reminders; the suspension list.
- **ADM-08** Settings and flags:
  - subscription price and trial days;
  - timeouts; first-order cash cap;
  - service-area polygons;
  - flags and kill switches: ordering per city, `menu_photo_import`, `online_payments`, `subscription_online_payment`, `ramadan_mode`.
- **ADM-09** Audit log viewer with filters.
- **ADM-10** Support inbox for help-form messages linked to orders. Replies go by SMS or push.

## 3. Order lifecycle

States: `scheduled`, `pending_acceptance`, `accepted` (shown as "Preparing"), `ready`, `out_for_delivery`, `delivered`, `collected`, `rejected`, `expired`, `cancelled`, `delivery_failed`.

| From | Command | Actor | To | Guards / side effects |
|---|---|---|---|---|
| — | `place` | customer | `pending_acceptance` or `scheduled` | **Guards:** valid quote; restaurant open (or valid slot); inside zone; min order; verified sign-in identifier and a valid order contact phone; cash cap (MON-08); not blocked; idempotent. **Effects:** notify the restaurant; enqueue timers. |
| `scheduled` | `release` | system | `pending_acceptance` | runs at slot − (prep + travel + 10 min) |
| `scheduled`, `pending_acceptance` | `cancel` | customer | `cancelled` | reason required |
| `pending_acceptance` | `accept(prepMin)` | merchant | `accepted` | prepMin 5–120; sets ETAs |
| `pending_acceptance` | `reject(reason)` | merchant | `rejected` | optionally marks items sold out |
| `pending_acceptance` | `expire` | system | `expired` | placed + 8 min (setting) |
| `accepted` | `markReady` | merchant | `ready` | — |
| `accepted`, `ready` | `assignCourier(id)` | merchant | same state | driver belongs to the restaurant and is active |
| `ready` (delivery) | `pickUp` | courier or merchant | `out_for_delivery` | driver assigned; starts tracking |
| `out_for_delivery` | `deliver(code)` | courier | `delivered` | code matches (5 tries) or photo fallback |
| `out_for_delivery` | `fail(reason)` | courier | `delivery_failed` | ≥ 10 min waited and ≥ 2 call attempts |
| `ready` (pickup) | `collect` | merchant | `collected` | — |
| `accepted`, `ready` | `cancel(reason)` | merchant | `cancelled` | push + SMS to the customer |
| any non-terminal | `force(to, reason)` | admin | any legal target | audited |

- **ORD-01** Terminal states (`delivered`, `collected`, `rejected`, `expired`, `cancelled`, `delivery_failed`) accept no further command.
- **ORD-02** Every transition appends exactly one `order_events` row: actor, from, to, payload, time. Times are monotonic.
- **ORD-03** Optimistic concurrency: commands carry the expected `version`; a stale version returns 409 `order_conflict`. Two concurrent accepts → exactly one wins (integration test with real parallel transactions).
- **ORD-04** Commands are idempotent per `Idempotency-Key`: a replay returns the original result and creates no second event.
- **ORD-05** `place` is idempotent per (customer, `Idempotency-Key`) for 24 h. A double-tap never creates two orders.
- **ORD-06** Orders snapshot names, prices and options at placement. Later menu edits never change existing orders.
- **ORD-07** Timers are graphile-worker jobs enqueued **in the same transaction** as the state change. A handler re-checks the state and does nothing if it moved on.
- **ORD-08** Short code: 6 characters from an unambiguous alphabet (no 0/O/1/I/L), shown as `K7M-4QX`. Unique per restaurant per day.
- **ORD-09** Delivery code: 4 random digits, stored hashed, shown only to the customer/recipient. 5 wrong tries locks it, and the photo fallback is required.
- **ORD-10** Restaurants and drivers see the customer's phone only while the order is active and for 24 h after. Then it is masked.
- **ORD-11** Test orders (MER-25) never notify customers and never count in analytics or billing.
- **ORD-12** Property test: random command sequences from random actors never break ORD-01…ORD-03.

## 4. Money and pricing

- **MON-01** Money is integer DZD (`Dzd` branded type), with no floats anywhere money flows. DB: `integer` for amounts, `bigint` for sums. DZD has no sub-unit in practice, so no centimes.
- **MON-02** `subtotal = Σ qty × (unitPrice + Σ optionDeltas)`.
- **MON-03** Discounts: one promo per order.
  - Percent rounds half-up to whole DZD, capped by the promo cap and the subtotal.
  - Fixed ≤ subtotal.
  - Free delivery sets the fee to 0.
- **MON-04** Delivery fee:
  - `base + ceil(roadKm × 2) / 2 × perKm` (km rounded up to 0.5), rounded to the nearest 10 DZD;
  - 0 when `subtotal − discount ≥ freeOver`; 0 for pickup.
- **MON-05** `total = subtotal − discount + deliveryFee`. Never negative. There is no platform fee line.
- **MON-06** The minimum order is checked on the subtotal, before discount.
- **MON-07** Change: `total ≤ payingWith ≤ total + 10 000`; the driver sees `payingWith − total`.
- **MON-08** Fraud limits:
  - customers with 0 completed orders: cash total ≤ 6 000 DZD (setting);
  - customers with ≥ 2 failed or no-show deliveries: their orders carry a "confirm by phone" warning for the restaurant. They are not auto-blocked.
- **MON-09** The server computes every amount. A quote lives 10 min. `place` must match the quote hash or the customer re-quotes (CUS-17).
- **MON-10** fast-check property tests: the total equals the sum of its parts, it is never negative, and discounts never exceed the caps.

## 5. Hours, scheduling, Ramadan

- **HRS-01** "Open now" is computed in `Africa/Algiers`:
  - weekly ranges, including across midnight;
  - special dates override the week; busy mode overrides both.
  - Property tests around 00:00 and range edges.
- **HRS-02** Scheduled slots:
  - every 15 min; the earliest is now + prep + travel, rounded up; the latest is 3 days ahead;
  - only inside opening ranges, minus the prep buffer.
- **HRS-03** Ramadan (flag `ramadan_mode`):
  - Maghrib is computed per restaurant location and day;
  - Ramadan schedules are offsets from Maghrib;
  - the "Iftar" slot targets arrival 5 min before Maghrib at the delivery location;
  - a countdown to Maghrib shows on home.
  - Tests use fixed dates in Feb–Mar 2027 against a reference prayer-time table checked into the repo.

## 6. Search (Arabic, French, English, Arabizi)

- **SRCH-01** `normalize(text)`:
  - NFKC, lowercase, strip Latin accents;
  - Arabic: remove tashkeel (U+064B–U+065F, U+0670) and tatweel (U+0640); `أ إ آ ٱ → ا`, `ة → ه`, `ى → ي`, `ؤ → و`, `ئ → ي`;
  - Arabic-Indic and Persian digits → 0–9;
  - collapse spaces.

  Idempotent (property test).
- **SRCH-02** Phonetic skeleton for cross-script matching. Map both scripts to consonant classes and drop vowels and `ا و ي ع ء` plus final `ه`:

  | Class | Arabic | Latin / Arabizi |
  |---|---|---|
  | B | ب | b, p |
  | T | ت ط ث | t, th |
  | J | ج | j, dj, g before e/i |
  | H | ح ه | h, 7 |
  | X | خ | kh, 5 |
  | D | د ض | d |
  | Z | ذ ز ظ | z |
  | R | ر | r |
  | S | س ص | s, c before e/i |
  | C | ش | ch, sh |
  | G | غ | gh, 8 |
  | F | ف | f, v |
  | Q | ق ڨ | q, 9, g before a/o/u |
  | K | ك | k, c before a/o/u |
  | L | ل | l |
  | M | م | m |
  | N | ن | n |

  Collapse repeated letters. Examples: `chawarma`, `shawarma` and `شاورما` all give `CRM`; `mhadjeb` and `محاجب` give `MHJB`.
- **SRCH-03** Synonym table `packages/i18n/search-synonyms.json`. Seed it and extend it:

  | Dish | Spellings |
  |---|---|
  | pizza | pizza, بيتزا, pitza |
  | tacos | tacos, طاكوس |
  | shawarma | chawarma, شاورما |
  | mhadjeb | mhadjeb, m'hadjeb, محاجب |
  | karantika | garantita, karantika, كرانتيكا |
  | couscous | couscous, kesksou, كسكس |
  | chorba | chorba, شربة |
  | bourek | bourek, بوراك |
  | zlabia | zlabia, زلابية |
  | qalb el louz | qalb el louz, قلب اللوز |
  | chicken | poulet, djaj, دجاج |
  | grill | grillade, مشوي |
  | burger | burger, برغر |
  | panini | panini, بانيني |
  | fries | frites, فريت |
  | juice | jus, عصير |
  | coffee | café, قهوة |
  | pastry | pâtisserie, حلويات |
  | fish | poisson, حوت |
- **SRCH-04** Index: `search_documents` (entity type and id, restaurant id, normalized text, skeleton, `tsvector('simple')`), with GIN trigram indexes on normalized text and skeleton. Updated by job on menu change.
- **SRCH-05** Ranking `0.55·text + 0.20·proximity + 0.15·openNow + 0.10·bayesianRating`; ties broken by 30-day orders. Typo tolerance via trigram similarity ≥ 0.3; prefix match for typeahead.
- **SRCH-06** Golden tests: each of these queries must return the expected dish or restaurant in the top 3:
  - `chawarma`, `shawarma`, `شاورما`, `chawerma`
  - `tacos`, `tacose`, `طاكوس`
  - `pizza`, `piza`, `بيتزا`
  - `mhadjeb`, `محاجب`
  - `garantita`, `كرانتيكا`
  - `kesksou`, `كسكس`
  - `djaj`, `دجاج`
  - `زلابية`
  - `chorba`
  - `burger`, `برغر`

  Search p95 < 120 ms with 500 restaurants and 30 000 items (integration benchmark).

## 7. Maps, addresses, tracking, ETA

- **GEO-01** Service areas are PostGIS polygons, editable by the admin. The seed covers urban Algiers communes.
- **GEO-02** Address capture:
  - "Use my location" = high accuracy, 15 s timeout, no cache;
  - show the accuracy circle; if accuracy > 40 m, ask the user to refine;
  - the map has a fixed centre pin (move the map, not the pin);
  - then the details form (CUS-11).
- **GEO-03** Zone check with `ST_Covers`. Road distance from OSRM. If OSRM fails: haversine × 1.35, behind a circuit breaker (3 failures → open for 60 s).
- **GEO-04** ETA:
  - prep + travel + a 3 min buffer, shown as a range [eta − 3, eta + 5] rounded to 5 min;
  - out for delivery: recomputed from the driver's position, at most every 30 s.
- **GEO-05** Basemap:
  - Protomaps PMTiles extract for northern Algeria, served by Martin as XYZ vector tiles (works for MapLibre GL JS *and* MapLibre Native);
  - style generated from the design tokens in light and dark;
  - labels use `name:ar` / `name:fr` / `name` per UI language, with Arabic shaping via the self-hosted MapLibre RTL text plugin;
  - 3D building extrusions from zoom 15; tracking tilts to 45–60°.
- **GEO-06** Driver location intake:
  - reject points outside the Algeria bbox, accuracy > 100 m, timestamp older than 2 min, or speed > 150 km/h;
  - keep the latest position and a breadcrumb;
  - broadcast; retention 30 days.
- **GEO-07** The client interpolates the marker between updates, rotates it to the bearing, and never snaps backwards (ease when the jump is > 30 m).
- **GEO-08** Plus code (Open Location Code, 10 characters) is stored per address and shown to the driver. Navigation links always use lat,lng.
- **GEO-09** Reverse geocoding (Nominatim, Algeria extract) only adds a readable label. Flows never block on it.
- **GEO-10** The map chunk is lazy-loaded. In low-data mode a placeholder with the address text and a "Show map" button replaces it.

## 8. Notifications

| Event | Recipient | Channels |
|---|---|---|
| order placed | restaurant | realtime board + looping sound, web push / partner push, SMS at 3 min (MER-05) |
| accepted / ready (pickup) / out for delivery / delivered | customer | push |
| rejected / expired / cancelled / delivery failed | customer | push + SMS |
| driver assigned | driver | push |
| delivery code | recipient (CUS-15) | SMS |
| invoice issued / due / past due / suspended | restaurant owner | SMS + dashboard banner |
| restaurant not responding ×3 in a day, error spike, job backlog | admin | Telegram bot + email |

- **NOT-01** Sends are idempotent per (event id, recipient, channel).
- **NOT-02** Each recipient gets their own locale.
- **NOT-03** No personal data in push payloads beyond first name and order code.
- **NOT-04** Adapters behind interfaces: `SmsSender` (console, http-generic, + one real provider chosen by Mahdi), `WebPush` (VAPID), `ExpoPush`. Each has a fake with an inspectable outbox for tests.
- **NOT-05** The board sound unlocks with a "Tap to enable sound" gate on load (browser autoplay rules). It uses an original, distinctive tone, generated and committed under `apps/web/public/sounds`.

## 9. Auth, sessions, permissions

- **AUTH-01** OTP:
  - Phone and email use the same six-digit, single-use OTP flow. Expire codes after 10 minutes and lock a challenge at five wrong attempts.
  - Store a server-keyed HMAC of the code and compare it in constant time. Use the same public response whether or not an account exists.
  - One account can hold a verified Algerian mobile and one verified email. Trim and lowercase email before lookup. Verify additions and changes against the current account and session. Each verified identifier belongs to one account. Account linking never merges accounts.
- **AUTH-02** OTP limits:
  - per normalized phone or email: 3 per 15 min and 10 per day;
  - per IP: 20 per hour;
  - resend cooldown 45 s.
- **AUTH-03** Sessions:
  - 256-bit random tokens, stored hashed;
  - web: cookie `__Host-session` (HttpOnly, Secure, SameSite=Lax);
  - mobile: `Authorization: Bearer`, token kept in SecureStore;
  - 30-day rolling idle timeout; a device list with revoke; logout everywhere.
- **AUTH-04** State-changing cookie requests must pass an Origin/`Sec-Fetch-Site` same-origin check (CSRF).
- **AUTH-05** Admin needs TOTP. Admin sessions last 12 h.
- **AUTH-06** Every route declares a policy. Deny by default.
- **AUTH-07** Merchant and courier scopes are applied in SQL, never trusted from client input.
- **AUTH-08** The authorization matrix test (AGENTS.md §6) covers 100% of routes.
- **AUTH-09** Prefer Better Auth (phone-number plugin + Expo plugin) if it meets AUTH-01…05 exactly. If not, build minimal sessions. Record the choice in DECISIONS.

- The public auth config lists the methods with a configured adapter. SMS uses Twilio or the existing webhook. Email uses Resend. Use localized AWID messages in Arabic, French and English, with a plain-text email alternative. Development and tests can inspect a fake outbox.
- Send codes to the selected channel. Staff and courier invitations accept a phone or email and can be redeemed only by the account that verified that identifier. Deletion uses a verified channel on the current account.
- Include both identifiers in personal-data export and erasure. Keep them out of logs and push payloads.

## 10. Languages and formats

- **I18N-01** Locales `ar` (RTL), `fr`, `en`, as URL prefixes `/ar`, `/fr`, `/en`.
  - Detection: cookie, then `Accept-Language`, then `fr`.
  - The language switcher is reachable from every screen.
  - `hreflang` on public pages.
- **I18N-02** Formats in every locale:
  - **Latin digits 0–9 always.** `ar-DZ` already uses `latn`; force it anyway.
  - 24-hour times `19:30` (`hourCycle: 'h23'`).
  - Algerian month names in Arabic, as `ar-DZ` gives them (`8 فيفري`).
  - Time zone `Africa/Algiers`.
- **I18N-03** Money:
  - `1 450 DA` (fr/en) and `1 450 دج` (ar);
  - Latin digits, U+202F narrow no-break space between thousands, unit after the number, no decimals;
  - wrapped in `<bdi>` inside RTL text.
  - One formatter in `packages/i18n`, with unit tests per locale.
- **I18N-04** Phones are stored as E.164 `+213550123456` and shown as `0550 12 34 56`.
- **I18N-05** Restaurant content fallback order:
  - ar UI: ar → fr → en
  - fr UI: fr → ar → en
  - en UI: en → fr → ar

  Optional flag `menu_ai_translate` suggests translations in the builder, applied only after the merchant approves them.
- **I18N-06** No string literals in UI code (lint rule). Use ICU messages with plurals; Arabic has six plural forms (zero/one/two/few/many/other) and needs tests.
- **I18N-07** A pseudo-locale (+40% length, accents) in dev and visual tests catches truncation. Every screen has an RTL screenshot test.

## 11. Restaurant subscription billing

- **BIL-01** Settings: price (default 5 000 DZD/month), trial (default 30 days from go-live), due after 7 days, grace 7 more days.
- **BIL-02** Lifecycle: `trialing → active → past_due → suspended → active` (on payment). `cancelled` on request.
  - Suspended restaurants are hidden from customers but can still log in and pay.
- **BIL-03** A daily job at 06:00 Africa/Algiers issues invoices at period start and sends reminders on days 0/5/7/12. It suspends at day 14.
  - Idempotent per (subscription, period).
- **BIL-04** Invoices:
  - sequential numbers per year `2027-000123`;
  - PDF with company legal details from settings, amount and period;
  - tax fields configurable (rate default 0) until the accountant confirms (HUMAN_TODO).
- **BIL-05** Payments: cash, CCP transfer, BaridiMob (proof photo + reference, confirmed by the admin), or Chargily online (flag; webhook signature verified; idempotent by provider event id).
- **BIL-06** The test-order and demo flags never create invoices.

## 12. Data model (PostgreSQL + PostGIS; UUIDv7 ids; `timestamptz` everywhere)

| Table | Notes |
|---|---|
| `users` | phone_e164 (unique), name, locale, theme, low_data, blocked_at, deleted_at |
| `sessions` | token_hash, user_id, device, ip, last_seen_at, expires_at (or the Better Auth tables) |
| `otp_challenges` | phone, code_hmac, purpose, attempts, expires_at, consumed_at, ip |
| `merchant_members` | merchant_id, user_id, role |
| `couriers` | user_id, merchant_id (**nullable** for phase-2 riders), status, online_at |
| `admins` | user_id, totp_secret_enc |
| `wilayas` | code, name_ar, name_fr — **69 wilayas** (2026 reform, codes 1–69) |
| `communes` | wilaya_code, name_ar, name_fr, centroid — **1 541 communes**. Seed from a maintained dataset (e.g. the `geoalgeria` npm package; check its licence and that the counts are exactly 69 and 1 541) and check in a test that asserts both counts. |
| `service_areas` | city, polygon geography, active |
| `addresses` | user_id, label, location geography(Point), accuracy_m, plus_code, commune_id, building, floor, apartment, landmark, instructions, voice_note_media_id, is_default |
| `merchants` | slug, kind (`restaurant` now; `grocery`/`shop` later), names/descriptions ar/fr/en, cuisines[], phone, backup_phone, location, address_text, commune_id, logo/cover media, status, price_level, default_prep_min, modes, pay-at-door flags, legal_name, rc_number, is_demo, paused_until |
| `merchant_hours` | merchant_id, weekday, opens, closes (crosses midnight when closes < opens) |
| `merchant_special_days` | date, closed / ranges |
| `merchant_ramadan_rules` | weekday or all, open/close offsets from Maghrib or absolute, suhoor window |
| `delivery_zones` | merchant_id, polygon, base_fee, per_km_fee, free_over, min_order, max_km, extra_eta_min, active |
| `categories` | merchant_id, names, sort, available_from/to |
| `items` | merchant_id, category_id, names, descriptions, price_dzd, photo media, tags[], prep_extra_min, is_available, sold_out_until, archived_at, external_key, moderation_status |
| `option_groups` | merchant_id, names, min, max |
| `options` | group_id, names, price_delta_dzd ≥ 0, is_default, is_available, sort |
| `item_option_groups` | item_id, group_id, sort |
| `price_history` | item_id, old, new, actor, at |
| `quotes` | customer_id, merchant_id, payload_hash, breakdown jsonb, expires_at |
| `orders` | short_code, customer_id, recipient name/phone, merchant_id, status, version, fulfilment, scheduled_for, address snapshot jsonb + location, subtotal/discount/delivery_fee/total, payment_method, paying_with, note, prep_min, eta fields, courier_id, delivery_code_hash, code_attempts, is_test, idempotency_key; one timestamp per state |
| `order_items` | order_id, item_id, name snapshot, unit_price, qty, options snapshot jsonb, line_total, note |
| `order_events` | append-only: order_id, type, from, to, actor_type, actor_id, payload, at |
| `courier_positions` | courier_id, order_id, location, accuracy, heading, speed, recorded_at (30-day retention) |
| `courier_presence` | courier_id → latest position, online flag |
| `ratings` | order_id unique, food/delivery stars, comment, reply, timestamps |
| `favorites` | user_id, merchant_id |
| `promotions` | see MER-19 |
| `promotion_redemptions` | promotion_id, order_id, user_id |
| `push_subscriptions` | user_id, kind (`web`/`expo`), endpoint/token, keys, last_seen_at |
| `notifications` | idempotency_key unique, user_id, channel, template, status, error |
| `media` | owner, kind, variants jsonb, thumbhash, width, height, bytes |
| `subscriptions` | merchant_id, price_dzd, status, trial_ends_at, period_start, period_end |
| `invoices` | merchant_id, number, period, amount_dzd, tax fields, status, pdf media |
| `payments` | invoice_id, method, amount, reference, proof media, confirmed_by, provider_event_id unique |
| `support_messages` | order_id, user_id, body, status, replies |
| `audit_log` | actor, action, entity, entity_id, diff jsonb, ip, at |
| `settings` | key → jsonb (typed by zod) |
| `feature_flags` | key, enabled, rules jsonb |
| `analytics_events` | first-party only: name, user/anon id, props, at; rolled up daily |
| `search_documents` | §6 |

Constraints: every foreign key is indexed, checks on money ≥ 0, partial unique indexes where needed (one default address per user). Migrations are forward-only and backward compatible (expand → migrate → contract).

## 13. API (Fastify, REST, `/v1`, OpenAPI from zod)

**Conventions:**
- JSON with camelCase fields; zod `.strict()` inputs; body ≤ 256 KB.
- Pagination: `?cursor=&limit≤100` (keyset).
- Errors: problem+json with `code`.
- `Idempotency-Key` header on every POST that creates or transitions something.
- `ETag` and `If-None-Match` on menus and feed.
- Rate limits per route class.
- `X-Request-Id` echoed back.

The generated OpenAPI spec is committed. CI runs `oasdiff` and fails on breaking changes to `/v1` once M10 starts.

| Area | Endpoints |
|---|---|
| Auth | `POST /v1/auth/otp/request`, `POST /v1/auth/otp/verify`, `POST /v1/auth/logout`, `GET /v1/me/sessions`, `DELETE /v1/me/sessions/:id` |
| Me | `GET/PATCH/DELETE /v1/me`, `GET /v1/me/export`, addresses CRUD, favourites, `POST /v1/me/push-subscriptions`, `GET /v1/me/orders`, `POST /v1/me/orders/:orderId/reorder` |
| Discovery | `GET /v1/feed`, `GET /v1/search`, `GET /v1/merchants/:slug`, `GET /v1/merchants/:id/reviews`, `POST /v1/geo/serviceability`, `GET /v1/geo/reverse`, `GET /v1/geo/places`, `GET /v1/communes` |
| Ordering | `POST /v1/quotes`, `POST /v1/orders`, `GET /v1/orders/:id`, `POST /v1/orders/:id/{cancel,accept,reject,ready,assign,pick-up,collect,deliver,fail}`, `POST /v1/orders/:id/rating`, `GET /v1/track/:token` (public, read-only) |
| Merchant | `POST /v1/merchant-applications`, profile, hours, ramadan rules, zones, categories, items, option groups, `POST /v1/merchants/:id/menu/bulk-price/{preview,apply,undo}`, `POST /v1/merchants/:id/menu/import/{preview,apply}`, `POST /v1/merchants/:id/menu/photo-import` (flag), staff, couriers, promotions, reviews reply, `POST /v1/merchants/:id/pause`, analytics, billing, `POST /v1/merchants/:id/test-order` |
| Courier | `GET /v1/courier/jobs`, `POST /v1/courier/presence`, `POST /v1/courier/positions` (batch ≤ 50) |
| Media | `POST /v1/media/uploads` (direct upload, size and type checked), `GET /v1/media/:id` |
| Admin | merchants review/suspend, moderation, orders, users, billing, settings, flags, service areas, audit |
| Webhooks | `POST /v1/webhooks/chargily` (flag, signature verified) |
| Health | `GET /healthz` (process), `GET /readyz` (DB and jobs), `GET /metrics` (Prometheus, internal only) |
| Test only | `/__test__/clock`, `/__test__/reset`, `/__test__/outbox` — compiled out of production. A test asserts they return 404 in prod mode. |

Web and both Expo apps share `packages/contracts`: the zod schemas and a tiny typed fetch client. Responses are parsed in dev/test; in production only boundary-critical schemas are parsed, to save CPU on low-end phones.

## 14. Realtime

- **RT-01** One WebSocket endpoint `/v1/realtime`, authenticated by the session.
  - Topics: `order:{id}` (customer, its restaurant, its driver), `merchant:{id}:orders`, `courier:{id}:jobs`.
  - Typed messages (zod) with monotonic event ids.
- **RT-02** Clients resume with `lastEventId`; the server replays from `order_events` (MER-03 relies on this).
- **RT-03** Fan-out via Postgres `LISTEN/NOTIFY` (payload = ids only), so several API instances work without extra infrastructure. Heartbeat every 25 s; reconnect with jittered backoff.
- **RT-04** Driver positions reach the customer in ≤ 1 s (p95) inside the stack.

## 15. Background jobs (graphile-worker)

Jobs:
- `notify.send`
- `order.acceptReminder`, `order.smsEscalation`, `order.expire`, `order.releaseScheduled`
- `order.ratingPrompt`
- `media.process`
- `search.reindexMerchant`
- `billing.daily`
- `cleanup.retention` (positions 30 d, OTP 30 d, voice notes 30 d, expired sessions)
- `analytics.rollupDaily`
- `ops.watchdog` (alerts)

- **JOB-01** Every handler is idempotent and re-checks state.
- **JOB-02** Retries use exponential backoff; dead letters alert.
- **JOB-03** Jobs are enqueued inside the business transaction. This is our transactional outbox.
- **JOB-04** Chaos test: kill the worker mid-job and restart → exactly one effect.

## 16. Media

- Local disk volume in v1 behind a `MediaStore` interface (`local` + `s3` adapters); served by Caddy with immutable caching.
- Uploads go to a quarantine folder. The worker sniffs magic bytes, re-encodes with sharp, writes the variants, deletes the original and strips EXIF/GPS.
- No SVG uploads. Voice notes: Opus/AAC ≤ 20 s, ≤ 500 KB, deleted after 30 days.

## 17. Security, privacy, abuse

**17.1 Baseline (OWASP ASVS L2):**
- Everything in §9.
- CSP with nonces (`script-src 'self' 'nonce-…' 'strict-dynamic'`), with `worker-src 'self' blob:` for MapLibre. Same-origin API, so no CORS in production.
- HSTS, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (geolocation/camera/microphone = self), `frame-ancestors 'none'`.
- Upload limits; zod strict input everywhere.
- gitleaks pre-commit and in CI; `pnpm audit --prod` fails on high; CodeQL; OWASP ZAP baseline against staging at M9.

**17.2 Privacy (Law 18-07, Law 18-05 Art. 26):**
- Collect only what an order needs.
- Consent screens for location and notifications.
- Data export and account deletion (anonymise personal fields; keep order records for accounting with personal data removed).
- Retention table in `docs/PRIVACY.md`.
- First-party analytics only; no ad trackers, no third-party fonts or CDNs at runtime.
- External processors (SMS provider, push services) receive the minimum.

**17.3 Prohibited goods (Law 18-05 Art. 3):**
- A moderation service checks item names and descriptions against keyword lists in ar/fr/en/Arabizi for alcohol, tobacco/cigarettes, medicines/pharmacy, gambling.
- Matches set `moderation_status = 'blocked_pending_review'`; the admin reviews them.
- There is no "pharmacy" restaurant kind.

**17.4 Abuse:** MON-08 limits, OTP limits, per-IP and per-account rate limits, block lists, and courier-position sanity checks (GEO-06).

## 18. Non-functional requirements (budgets enforced in CI)

| ID | Budget |
|---|---|
| NFR-01 | Customer routes (Lighthouse mobile, slow 4G, mid-range Android emulation): **LCP ≤ 2.5 s**, **INP ≤ 200 ms**, **CLS ≤ 0.1**. Performance ≥ 90, Accessibility ≥ 95, Best practices ≥ 95, SEO ≥ 95. |
| NFR-02 | Initial JS per customer route **≤ 180 KB gzip**. Map and 3D are separate lazy chunks (size-limit). |
| NFR-03 | API on a 4 vCPU / 8 GB VPS: p95 reads ≤ 200 ms and `place` ≤ 400 ms at 50 req/s. Realtime: 300 board sockets + 100 drivers sending positions every 5 s (k6 thresholds). |
| NFR-04 | Availability 99.5%/month. RPO ≤ 24 h (nightly encrypted dump) and RTO ≤ 2 h (restore drill script tested). |
| NFR-05 | WCAG 2.2 AA. axe: zero serious/critical issues on every page. |
| NFR-06 | Works on Android 9+ Chrome, iOS 16.4+ Safari, and the latest desktop browsers. 360 px wide minimum. |
| NFR-07 | Observability: JSON logs with request/order ids; error tracking with PII scrubbing (`SENTRY_DSN` optional); Prometheus metrics; uptime checks; Telegram/email alerts. |

## 19. Architecture and stack (pin the **latest stable** of each, verified with `npm view` or official changelogs at M0)

```
apps/
  web/          Next.js 16.x (App Router, React 19, React Compiler), Tailwind CSS v4, Motion (motion/react),
                three + @react-three/fiber + drei (lazy), maplibre-gl, next-intl, TanStack Query,
                Zustand (cart), react-hook-form + zod, Radix primitives, Lucide, Serwist (PWA)
  api/          Fastify 5 + fastify-type-provider-zod + @fastify/websocket + @fastify/rate-limit, pino
  worker/       graphile-worker
  mobile/       Expo SDK 58 (React Native 0.88, New Architecture, Hermes) — customer app
  partner/      Expo SDK 58 — restaurant + courier modes
packages/
  domain/       pure logic: money, pricing, order state machine, hours, search normalizer, fees
  contracts/    zod schemas, OpenAPI generation, typed client
  db/           Drizzle ORM schema + migrations + repositories + seed (postgres.js driver)
  geo/          map style builder (tokens → MapLibre style), OSRM client, geo utils
  i18n/         messages ar/fr/en, formatters, synonyms
  tokens/       design tokens (JSON) → CSS variables, Tailwind theme, RN theme
  ui/           web components
  ui-native/    native components (M10)
  config/       tsconfig, eslint, prettier, vitest presets, brand.ts
infra/          Dockerfiles, compose (dev/prod), Caddyfile, backup/restore, tiles + OSRM prep scripts
e2e/            Playwright multi-actor tests, visual baselines
load/           k6 scripts
docs/
```

- Other libraries: zod 4, sharp, thumbhash, open-location-code, libphonenumber-js, adhan, web-push, expo-server-sdk.
- Database: PostgreSQL 18 + PostGIS (latest compatible) with `pg_trgm` and `unaccent`. Use built-in `uuidv7()`.
- Map stack: Protomaps PMTiles extract, Martin, OSRM (car profile, Algeria extract from Geofabrik), Nominatim (optional service).
- Tooling: pnpm workspaces + Turborepo, Vitest, fast-check, Testing Library, MSW, Playwright + @axe-core/playwright, StrykerJS, k6, Lighthouse CI, size-limit, knip, dependency-cruiser, gitleaks, oasdiff, Maestro and Jest (mobile).
- Infra: Docker Compose, Caddy 2 (HTTPS, HTTP/3, zstd/br), GitHub Actions, GHCR.

Same origin in production: Caddy routes `/v1/*` and `/healthz` to the API, `/tiles/*` to Martin, `/media/*` to the media volume, and everything else to Next.js.

## 20. Deployment and operations

- **Environments:**
  - local: compose;
  - staging: any VPS, **synthetic data only**;
  - production: a VPS **hosted in Algeria** on the `.com.dz` domain (Law 18-05 Art. 8).
- **CI** (GitHub Actions):
  - lint, typecheck, unit; integration (PostGIS service); e2e on the production build; Lighthouse; security;
  - images pushed to GHCR;
  - staging deploys on `main`; production deploys on a tag with manual approval.
- **Deploys:**
  - `migrate` runs as a one-off container first;
  - `docker compose up -d --wait` with health checks;
  - instant rollback to the previous image tag.
- **Backups:**
  - nightly `pg_dump -Fc` plus the media volume, encrypted (age), copied to a second location Mahdi chooses;
  - `infra/scripts/restore-drill.sh` restores into a scratch container and runs smoke tests.
- **Kill switches:** ordering per city, a maintenance banner, and every feature flag.
- **Runbooks** in `docs/runbooks/`: deploy, rollback, restore, Ramadan peak checklist; plus one each for API down, DB full, SMS provider down, tiles down, OSRM down, and a restaurant flood of complaints.
- **Smoke tests after each deploy:** health, home renders, API ping, socket connects, a tile loads.

## 21. Native apps (M10–M12)

- **MOB-01** Customer app: same features as customer web (CUS-*). Expo Router; the shared `contracts`, `domain`, `i18n` and `tokens` packages; Reanimated 4 + Gesture Handler for motion; expo-image (thumbhash); MapLibre React Native with our style and tiles.
- **MOB-02** Partner app: restaurant mode (board, accept/reject, ready, sold-out toggles, menu quick edits) and courier mode (COU-*). Background location with a foreground service (Android) and "Always" permission (iOS), with clear disclosure screens.
- **MOB-03** Auth by OTP with SMS autofill (iOS `oneTimeCode`, Android SMS Retriever). Tokens in SecureStore.
- **MOB-04** Push: expo-notifications. On Android, an `orders` channel at high importance with a custom sound for the partner app.
- **MOB-05** Deep and universal links: `/[locale]/r/[slug]` and tracking links open the app if installed (`apple-app-site-association` and `assetlinks.json` served by web).
- **MOB-06** EAS Build profiles (development, preview, production); EAS Update with fingerprint runtime version and staged rollout; EAS Submit.
- **MOB-07** Store compliance:
  - in-app account deletion plus a web deletion URL;
  - privacy labels / data-safety answers drafted in `docs/store/`;
  - the current Google Play target-API requirement is met (verify);
  - no social login, so Sign in with Apple is not required.
- **MOB-08** Testing: Jest + RNTL for components, and Maestro flows for every journey on an Android emulator (low-end profile) and an iOS simulator when available. Performance: 60 fps on scroll and transitions on a mid-range Android, and cold start < 2.5 s.

## 22. Phase 2 — design for it, do not build it until Mahdi says so

- Platform riders: courier pool (`couriers.merchant_id` null), shifts, dispatch (nearest available, batching), earnings, cash remittance.
- Groceries (`merchant.kind = 'grocery'`): packaged goods only, barcodes, variants, stock, substitution rules (call / swap / refund).
- Online card payments via Chargily with **per-restaurant keys** (money goes straight to the restaurant; the platform never holds customer funds).
- More cities (service areas plus a city launch checklist), group orders, loyalty.

## 23. Never

Medicines, alcohol, tobacco or gambling; storing card numbers; holding customer money in v1; fake reviews or fake restaurants in production; dark patterns (hidden fees, pre-checked upsells).
