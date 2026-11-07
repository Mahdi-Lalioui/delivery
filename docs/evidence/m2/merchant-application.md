# M2 restaurant application and review evidence

The staged `pnpm verify` passed 51 tooling checks, 620 unit tests and 59 real PostGIS integration tests. The 72-test authorization suite and the generated OpenAPI check passed.

## Production browser

`pnpm test:e2e:auth --fail-on-flaky-tests` passed all seven HTTPS Chromium journeys. The three `@merchant-application` journeys used the optimized web app, compiled API and disposable Docker PostGIS.

- An Arabic applicant started from the public landing page and verified their phone by OTP. The API rejected an out-of-commune pin and stored a valid Algiers pin. A separate French admin signed in with OTP and TOTP and approved the pending application with a reason. The applicant saw the approved status and received 403 from the admin queue.
- The API committed an application whose response the browser lost. After a simulated rate limit, the same idempotency key returned the original merchant ID and exactly one membership.
- Separate stale applicant and admin tabs sent the UUID of the session that loaded their data. The API returned `409 session_changed` after the shared cookie was replaced. Both screens cleared the old data. A current admin then rejected the still-pending application, and its owner saw the rejected status.

## Design and accessibility

The optimized Chromium matrix covered application and status in Arabic and French, plus admin queue and review detail in French and English. The 48 captures use both themes at 390×844, 768×1024 and 1280×800. All variants passed axe WCAG A and AA, locale and direction, horizontal overflow, and 44×44 minimum action size. Keyboard checks covered invalid-field, submission, review and approval focus.

The first review found raw E.164 phone text wrapping. After local formatting, a second review found overflow at 200% text size. The final font-relative grid passed all eight double-text combinations at 360px and 1280px. The formatted number stayed on one line inside its cell and the page width matched the viewport. The approval journey also checks the 360px case. All captures are lossless WebPs. [Normal and double-text captures](merchant-application/)

`pnpm test:visual --fail-on-flaky-tests` passed 35 home and design checks, including the public application link on the updated home page.
