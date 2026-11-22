# Design v2 review

Base `pilot-1` at `e2b9a4a9`. The pilot preview and its design fixtures
were captured at 390 px Arabic and French, 1280 px French, and 390 px
French dark. The capture command produced 60 first-view images and 60
full-page images for 15 entries, including the operations gallery.
The [design gallery](/fr/dev/gallery) pairs representative screens from
the baseline and the revised build. Its route is restricted to builds
with the design pages enabled.

## Landing and Discovery

- **Pass 1:** Replaced the looping photo stack with one credited,
  responsive chorba image and a separate copy surface. Put location,
  greeting and search on one quiet Discovery surface.
- **Pass 2:** Checked Arabic composition and French, dark and desktop
  captures. Kept RTL display tracking natural, balanced the headline,
  and allowed the search label to wrap without truncation.
- **Pass 3:** Applied the independent critique. Shortened the hero photo,
  made the team preview quieter, tightened Discovery controls, and
  increased selected fulfilment and address definition in dark mode.

Independent screenshot scores were recorded after the first pass and
before the fixes above. They are not final acceptance scores.

| Screen | Arabic 390 | French 390 | French 1280 | French dark 390 |
| --- | ---: | ---: | ---: | ---: |
| Landing | 8.4 | 8.1 | 8.8 | 8.2 |
| Discovery | 7.5 | 7.3 | 8.1 | 7.2 |

The critic identified mobile hero depth and the weight of the team link,
truncated search, low contrast between dark controls, and desktop rail
affordance. The first four have changes in this branch. Separate rating
of the refined captures, keyboard journey checks and the rest of the
screen-by-screen review are still pending.

## Skills

SkillSpector scanned the candidate packages before use. Vercel Web
Design Guidelines and Uxcel Typography were staged in a temporary
skill directory and applied to interaction, reduced motion, text
wrapping and typography. Anthropic Canvas Design was also staged.
Full UI UX Pro Max and Taste bundles were flagged, together with
Microsoft's Playwright agent skill. The project uses its pinned
Playwright browser runner. No unreviewed generator or setup helper ran.
The 3D and motion candidates' scripts were left out after the reviews
found unpinned dependencies or file-writing helpers.

## Reproduction

Run the frozen install, build workspace dependencies, then start a
design preview with the existing preview environment. Capture with
`pnpm evidence:screens <origin> <directory>`. The baseline captures
were taken from an unchanged design build, before applying the design
changes to the rendered pages.

## Refined screenshot scores

The independent critic scored the corrected chorba frik and control
refinements separately from the first pass.

| Screen | Arabic 390 | French 390 | French 1280 | French dark 390 |
| --- | ---: | ---: | ---: | ---: |
| Landing | 9.0 | 8.7 | 9.0 | 8.7 |
| Discovery | 8.0 | 7.9 | 8.3 | 7.8 |

Landing still loses category content below the French fold, and its
desktop hero photo softens at scale. Discovery still has a partially
visible desktop rail card without an explicit control, and its first
mobile filter row sits below the initial navigation edge. A catalogue
photo fallback and quieter-than-intended dark address border need
follow-up. These are screenshot scores. They do not measure interaction
latency or accessibility.

The operator pass groups merchant stages, courier address and cash
details, and the admin queue using CSS. The operations fixture was
recaptured, but the screens still need individual critique and scoring.

## Checkpoint verification

`pnpm verify` passed with 2,102 regular tests and 399 Postgres integration
tests. The four-project browser matrix passed 127 tests with ten
existing conditional skips, including the checked-in initial JavaScript,
fullness and accessibility checks. All 82 connected Chromium tests,
four national map checks and three preview tests passed. The connected samples
measured Discovery LCP at 1.704–1.712 s and Restaurant at 1.580–1.592 s,
with CLS 0. The connected network samples reported 253,233 and 259,173
compressed JavaScript bytes respectively under their separate network
budgets. The five-route 180 KB assertion measures the scripts referenced
by the initial HTML. Route-wide connected budgets and scroll frame rates
have not been verified for this design.

Next: complete the restaurant and dish experience, the ordering and
account flows, and the individual operator views, then repeat the
screenshots and critique across those screens.

## Restaurant and ordering checkpoint

The restaurant information panel now has a ruled edge and quieter
elevation. The empty desktop cart is compact, giving the menu visual
priority. Dish and cart sheets separate the title and content with a
visible rule. Checkout uses a neutral two-column surface at tablet
widths and above, and the account list uses the same ruled edge.

The preview flow opened a dish, chose an option, added it, and displayed
the populated cart in all four review layouts. The initial French dish
captures showed the loading state. Both versions were recaptured after
the dish form mounted. Cart and dish before images were taken from the
unchanged menu styles in the previous preview build.

The critic scored Restaurant at 7.4–8.2 and the populated Cart at
8.0–8.4. Loaded Dish scored 7.7–7.9 across all four variants. Restaurant photos and menu search still push prices
close to the navigation on phones. The mobile sheet scrim and dark cart
stepper need more separation, and the subtotal is repeated in the cart.

Full verify passed. The two-worker browser matrix had four WebKit map
timeouts. All four passed in isolation and the complete one-worker
matrix passed 127 tests with ten existing conditional skips. Connected
browser tests passed 82/82, national maps passed 4/4, and preview passed
3/3. The connected LCP samples were 1.704–1.768 s for Discovery and
1.528–1.564 s for Restaurant, with CLS 0 for both.

Next: critique the loaded dish and checkout/account captures, resolve
the noted mobile issues, and review confirmed, tracking, orders, rating,
sign-in and the individual operator screens.

### Ordering review

Independent scores for the pushed ordering checkpoint, before the
subsequent mobile payment and dish corrections.

| Screen | Arabic mobile | French mobile | French desktop | French dark mobile |
| --- | ---: | ---: | ---: | ---: |
| Dish | 7.7 | 7.9 | 7.9 | 7.7 |
| Checkout | 7.4 | 7.7 | 8.1 | 7.5 |
| Payment | 7.1 | 7.4 | 8.3 | 7.4 |
| Account | 7.9 | 8.1 | 8.0 | 8.0 |

The review identified cash controls below the mobile receipt, the first
dish option partially obscured by the sticky button, and the account
sound switch below the first viewport. The next pass moves cash before
the receipt in reading order and reduces the mobile dish photo height
and spacing. Re-capture those states before replacing the gallery files.

The follow-up captures show the cash amount field above the sticky order
button in Arabic at 390 px. The change amount still requires scrolling.
Both optional dish rows show above the sticky button in French dark at
390 px. The comparison gallery also includes the captured confirmation,
delivery and pickup tracking, rating, orders and sign-in screens in
the four variants. Those six baseline comparisons await their design
passes and critic scores.

The first verification attempt could not open local sockets for five
worker tests. The run with loopback access advanced through every
verification stage.

### Status and operator capture

The gallery now pairs the pilot and current merchant live board, courier
active job and admin live-order list fixtures. It does not represent
each screen in those workspaces.

| Screen | Arabic mobile | French mobile | French desktop | French dark mobile |
| --- | ---: | ---: | ---: | ---: |
| Confirmation | 8.6 | 8.7 | 8.4 | 8.7 |
| Delivery tracking fallback | 7.1 | 7.2 | 7.7 | 7.0 |
| Pickup tracking | 8.4 | 8.5 | 8.0 | 8.1 |
| Rating | 8.0 | 8.2 | 8.0 | 7.8 |
| Orders | 7.9 | 7.8 | 8.1 | 7.8 |
| Sign-in | 8.1 | 8.2 | 8.3 | 7.9 |

The preview depicted fallback maps in all four delivery tracking
captures. Prioritize a compact fallback that frees the first viewport
for order status and ETA. Follow with clearer pickup directions, more
compact active-order actions, consistent rating controls, stronger
sign-in method selection and a quieter confirmation backdrop.

The operator comparison used a fresh isolated build of `e2b9a4a9`.
Earlier captures from a newer standalone build were discarded, and the
admin captures were realigned to the live-order list. The critic scored
these exact pilot-to-current comparisons as follows.

| Screen | Arabic mobile | French mobile | French desktop | French dark mobile |
| --- | ---: | ---: | ---: | ---: |
| Merchant live board | 7.0 → 7.3 | 7.1 → 7.4 | 7.4 → 7.6 | 6.9 → 7.2 |
| Courier active job | 7.6 → 7.8 | 7.5 → 7.7 | 7.8 → 8.0 | 7.4 → 7.7 |
| Admin live-order list | 7.2 → 7.4 | 7.2 → 7.4 | 7.5 → 7.6 | 7.1 → 7.3 |

Merchant needs stronger prioritization of ready orders when earlier
stages are empty. The courier confirmation slider reads as disabled in
light mode, and the pickup fixture has no street address. The admin
sample has one order, so a crowded queue and its filters and
interventions still need review.

Chromium loaded 17 Arabic and 51 French comparison pairs, with every
image decoded successfully. The loopback-enabled full verify rerun
passed. The main browser matrix passed 127 tests with ten existing
conditional skips. Connected Android LCP ranged from 1.580 to 1.816 s
for Discovery and 1.532 to 1.584 s for Restaurant, both with CLS 0.

Populated search results were captured from the exact pilot and current
preview, in the same four variants. The final payment patch confines
the cash reorder to step three and gives both recap sections a
second-level heading. Ten focused checkout tests passed, including
cash reading order in Arabic and French and the absence of cash controls
on step one.

The complete gallery browser check decoded all 18 Arabic and 54 French
pairs. The same check confirmed the cash amount is visible above the
sticky action at 390 px in Arabic and French, and verified heading and
reading order on the payment step. The preceding browser matrix also
passed 82 authenticated tests, four national map tests and three
preview tests. The final heading and step-one regression corrections
were made after the initial browser build.

Next: repeat the exact-source gates, then refine delivery tracking's
fallback and pickup directions without introducing layout shifts.
