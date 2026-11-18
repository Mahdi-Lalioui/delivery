# Lane B security review (17 November 2026)

This review covers the lane-b changes against origin/main in the customer web UI: discovery, restaurant, checkout, tracking, retention, maps, design pages, the admin gallery, `packages/ui` and `scripts/*.mjs`. It was run with Claude Code's `/security-review` method and its false-positive filter, and reports only findings at 8/10 confidence or higher. Scope note: the slash command reads the diff of the checkout it starts in, which is the main folder on `m2-merchant-onboarding`. So the lane-b diff was reviewed by a sub-agent with the same prompt.

**Result: no findings.**

| Area | Checked | Verdict |
|---|---|---|
| Map pins | name, rating and ETA set through `textContent` and `<bdi>` parts; link `/${locale}/restaurants/${encodeURIComponent(slug)}`; logo only as an img `src` | safe |
| Unsafe DOM | no `dangerouslySetInnerHTML`, `innerHTML` or `postMessage` added | safe |
| `tel:` links | fixed scheme; numbers go only to that order's customer | intended |
| Redirects | no return or next parameter, no `location` assignment, only `reload()` | safe |
| Service worker and caches | no Cache API or IndexedDB use | safe |
| `/dev/screens` | only `page.design.tsx`, built only for dev, `ZAAFRAN_DESIGN_BUILD=1` (separate `.next-design`) or a Vercel preview with `ZAAFRAN_PREVIEW_DEMO=1`; noindex | not in production |

## Browser storage (no secrets, no tokens, no phone, no street address)

| Key | Storage | Holds |
|---|---|---|
| `zaafran.customer-cart.v1` | localStorage | domain `Cart`: version, merchant, lines, expiry (checked: no address or phone fields) |
| `zaafran.customer-cart-expired.v1` | localStorage | name of the restaurant whose basket expired |
| `zaafran.discovery.location.v1` | localStorage | approximate point, commune and service area, chosen by the diner |
| `zaafran.discovery.search-history.v1` | localStorage | recent search words |
| `awid:favourites` | localStorage | favourite merchant ids |
| `awid.feel.v1` | localStorage | haptics and sound switches |

`zaafran.courierInvite` (sessionStorage, courier invite id) belongs to lane A's courier code. It is listed so lane A can review it.
