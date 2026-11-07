# M2 device sessions evidence

The optimized Chromium run checked Arabic and French in both themes at 390×844, 768×1024 and 1280×800. All twelve variants passed axe WCAG A and AA, the expected language and direction, and the horizontal overflow check. The WebP screenshots match their source pixels. [Screenshot matrix](device-sessions/)

The initial French matrix flagged the revoke button because its accessible name omitted the visible label. The button now references its visible text and the device heading through `aria-labelledby`. The corrected matrix passed.

The device journey creates two sessions for the same account on the compiled API with disposable PostGIS. It switches locale, revokes the remote device and checks the current session remains active, then signs out everywhere and verifies both sessions are invalid.

`pnpm test:e2e:auth` passed all four HTTPS journeys. The stale-tab regression first reproduced an unintended 204. After the fix, the API returned `409 session_changed` when the page sent its original session ID with the newer account’s cookie. The page cleared the old list, and the newer account’s session remained active.
