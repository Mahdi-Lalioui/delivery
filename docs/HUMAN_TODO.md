# HUMAN_TODO — things only Mahdi can do

Codex appends items here (what, why, exact steps). Mahdi ticks them. Items marked **[before launch]** block the public launch, not the build.

## Accounts and tools
- [ ] Repository visibility and protection. The requested `Mahdi-Lalioui/delivery` remote is currently public. If you want the private setup described in the starter, open the repository's **Settings → General → Danger Zone → Change repository visibility** and select **Private**. Check plan support for branch protection and CodeQL before switching. Keep `main` protected with required CI checks once those checks exist.
- [ ] Enable Codex code review on the repo (Codex settings → code review → this repo).
- [x] Docker on the development Mac. Mahdi enabled Docker Desktop, and the three-service smoke check passed on its `desktop-linux` context. CI uses the exact Compose pin from D-001.
- [ ] Android Studio emulator (and Xcode + iOS simulator if you have a Mac) — needed from M10.

## Company and legal
- [ ] **[before launch]** Choose the final app name. Check the trademark (INAPI) and domain availability. Update `packages/config/src/brand.ts`.
- [ ] **[before launch]** Company registration (CNRC). Law 18-05 Art. 8 requires it to sell online, and it unlocks the `.com.dz` domain and an organisation developer account.
- [ ] **[before launch]** `.com.dz` domain (after CNRC). Use a temporary domain for staging.
- [ ] **[before launch]** Accountant: confirm invoice format and tax treatment of the subscription (VAT or IFU); fill the tax fields in admin settings.
- [ ] **[before launch]** Have a lawyer review the terms (customers, restaurants), the privacy policy and the restaurant contract drafts Codex writes.
- [ ] **[before launch]** ANPDP declaration for personal-data processing (Law 18-07).

## Infrastructure
- [ ] Staging server for the connected web release. Provision Ubuntu LTS with Docker Compose, a static IPv4, at least 4 GB RAM and 80 GB disk. Open TCP 80/443. Create a deployment account with access to the AWID Docker project and install its public SSH key. Point API, bare web and `www` DNS A records to the server; give the deployment account the DNS provider access needed to verify them. Set up the file paths and map data in [DEPLOY.md](DEPLOY.md) and [MAPS.md](../infra/MAPS.md).
- [ ] **[local readiness]** The local production Compose test has an empty map directory. Prepare the pinned Algeria PMTiles and OSRM files with the exact checksums and commands in [MAPS.md](../infra/MAPS.md), set `AWID_MAP_DIRECTORY` in the local Compose environment to that directory, restart Martin and OSRM, and rerun `infra/deploy/production-smoke.sh` against the local HTTPS domains. This is needed to prove the real vector tile path.
- [ ] **[before launch]** Production VPS **hosted in Algeria**: 4 vCPU / 8–16 GB / 160 GB SSD, Ubuntu LTS.
- [ ] **[before launch]** Second backup location for encrypted backups.

## Providers
- [ ] **[before launch, if using the webhook instead of Twilio]** Connect the authentication SMS gateway. Register a transactional sender ID and configure an HTTPS endpoint that accepts bearer authentication, a JSON body with `to` and `text`, and `Idempotency-Key` deduplication. Put its endpoint and credential in `AUTH_SMS_WEBHOOK_URL` and `AUTH_SMS_WEBHOOK_TOKEN` in the API secret file. Confirm sign-in, deletion and staff-invitation delivery on approved Mobilis, Djezzy and Ooredoo test numbers. [Gateway contract](DEPLOY.md#sms-webhook)
- [ ] **[phone/email phase]** Open the Twilio Console, enable sending to Algeria, and register a branded domestic alphanumeric sender for AWID. Request it early. Twilio lists a two-week provisioning estimate and flags delivery problems with generic or numeric senders on Mobilis. After approval, put the account SID, auth token and sender into the API and worker secret files, then verify delivery on approved Mobilis, Djezzy and Ooredoo test numbers. [Twilio Algeria SMS guidelines](https://www.twilio.com/en-us/guidelines/dz/sms)
- [ ] **[phone/email phase]** Add an AWID-owned transactional subdomain to Resend. Publish the exact SPF and DKIM records shown in its Domains dashboard and wait for Verified status. Create a sending key scoped to the domain, put it and the sender address in the API and worker secret files, and confirm Arabic, French and English OTP emails on approved test inboxes. [Resend domain setup](https://resend.com/docs/dashboard/domains/introduction)
- [ ] **[before launch]** Configure monitored worker alerts: after Resend sender verification, set `AUTH_RESEND_API_KEY`, `AUTH_RESEND_FROM` and `OPS_ALERT_EMAIL` in `/etc/awid/worker.env`; restart the worker and confirm an approved synthetic exhausted-job incident reaches that inbox. Keep the recipient and credentials server-side. The synthetic local path is proven in [worker alert evidence](evidence/awid/ops-alerts.md); external delivery still needs this check.
- [ ] Chargily Pay account, for restaurants paying their subscription online (optional at launch).
- [ ] (Optional) LLM API key, for menu import from photos (feature flag `menu_photo_import`).

## Brand (AWID)
- [ ] Send the original AWID logo and app icon as vector files (SVG or AI/PDF) and the confirmed Arabic name. Why: lane B redrew the logo and icon as SVG by tracing the brand board JPEG (`apps/web/public/brand/*.svg`); the originals would remove small tracing differences. Put the files in `docs/brand/`.

## Mobile stores (M10–M12)
- [ ] Apple Developer Program ($99/year). An organisation account needs a D-U-N-S number.
- [ ] Google Play Console ($25 once). **A new personal account must run a closed test with 12 testers opted in for 14 continuous days, per app, before production.** Recruit 12+ testers early (friends, family, pilot restaurants) and start the customer-app closed test by 15 Jan.
- [ ] A real low-end Android phone (2–3 GB RAM) for testing, plus an iPhone if possible.
- [ ] Install Xcode on the development Mac (App Store, free, ~15 GB; sign in with your Apple ID), then run `sudo xcode-select -s /Applications/Xcode.app` and open Xcode once to accept the licence and install the iOS simulator. Also install Android Studio with one emulator (Pixel, API 35). Why: lane B cannot run the M10 customer app on a simulator or run the Maestro flows (MOB-08) until these exist; today the app is only tested with Jest.

## Ground work
- [ ] Visit restaurants and sign 3–5 pilot restaurants for 11–20 Jan; photograph their menus (with permission).
- [ ] Recruit 20–30 pilot customers in the pilot neighbourhoods.
- [ ] Confirm the subscription price: 5 000 DA or 3 000 DA (admin setting, no code change).

- [ ] **[before launch]** Configure customer order-status SMS in the worker. Set
  `ORDER_SMS_WEBHOOK_URL` and `ORDER_SMS_WEBHOOK_TOKEN` in the deployment secret store.
  The HTTPS gateway must accept a bearer token and a JSON body with `to` and `text`.
  Make it deduplicate the `Idempotency-Key` header and return 2xx only after accepting
  the message. Verify an expired test order on an approved test number.

- [ ] **[before launch]** Provision persistent VAPID keys for order status web push.
  Run `pnpm --filter @zaafran/worker exec web-push generate-vapid-keys --json` in an
  approved environment. Set `VAPID_PUBLIC_KEY` on both the API and worker. Set
  `VAPID_PRIVATE_KEY` and a monitored `VAPID_SUBJECT` such as a `mailto:` address on
  the worker only. Verify an opted-in Chromium, Firefox and installed Safari PWA
  receives a test notification. Keep the same keys across deployments.

- [ ] **[now]** Stop file sync from duplicating repo files (found by Claude, 13 Nov 03:25).
  `.git/refs/heads/` holds copies named `lane-a 2`, `lane-b 2`, and
  `codex/lane-a-feed-rails 2` (likewise under `refs/remotes/origin/` and `refs/stash 2`).
  Because of them, `git fetch` fails with "bad object" (see `~/zaafran-takeover/logs/check.log`).
  `apps/web/.next/types/` gained `root-params.d 3.ts` and similar copies, which failed
  `pnpm verify` typecheck until they were deleted. The `~/Documents` folder is probably synced
  by iCloud ("Optimise Mac storage" / Desktop & Documents). Steps: exclude
  `~/Documents/ChatGPT/zaafran` from sync or move the repos out of `~/Documents`. Then check
  that each `* 2` ref matches its original (`git -C delivery show-ref`) and delete only the
  duplicate ref files.

## Third-party agent skills (lane B, 17 November 2026)

What: decide whether to install find-skills, web-design-guidelines, taste-skill, the freshtechbro three.js and react-three-fiber skills, and microsoft/playwright-cli. Each one should be scanned with NVIDIA SkillSpector first.
Why: these download and run code from outside repositories. The agent doesn't run unvetted downloads by itself, so it used the repo's own Playwright, axe and audit scripts instead.
Steps: clone github.com/NVIDIA/skillspector, scan each skill repository, read the report, then run the `npx skills add …` commands from the lane B brief.

## Real-phone check of the customer screens (lane B, 17 November 2026)

What: confirm on a physical mid-range Android phone what the lab measured on the Mac under the throttled Android profile:
- taps paint in 100 ms or less;
- scrolling holds 60 fps;
- layout shift stays under 0.05 on Discovery, Restaurant, Checkout and Tracking.

Why: the lab numbers come from Chrome on a Mac with 4× CPU throttling, not real phone hardware. The READINESS lines are ticked on lab evidence only.

You need: an Android phone with Chrome, a USB cable, and the Mac with this repo on branch `lane-b`.

Steps:
1. On the phone, open Settings → About phone and tap "Build number" 7 times. Then open Settings → System → Developer options and turn on "USB debugging". Connect the cable and accept the "Allow USB debugging" prompt.
2. On the Mac, start the map servers and the preview build:
   - `cd delivery-lane-b`
   - `docker start lane-b-martin-1 lane-b-osrm-1`
   - `cd apps/web`
   - `ZAAFRAN_TILE_ORIGIN=http://127.0.0.1:3101 ZAAFRAN_PREVIEW_DEMO=1 VERCEL_ENV=preview pnpm exec next build`
   - `ZAAFRAN_TILE_ORIGIN=http://127.0.0.1:3101 ZAAFRAN_PREVIEW_DEMO=1 VERCEL_ENV=preview pnpm exec next start --hostname 127.0.0.1 --port 3110`
3. Make the phone's localhost reach the Mac. In a second terminal, run `adb reverse tcp:3110 tcp:3110 && adb reverse tcp:3101 tcp:3101`. If `adb` is missing, run `brew install android-platform-tools` first.
4. On the Mac, open Chrome at `chrome://inspect/#devices`. The phone should be listed. On the phone, open Chrome at `http://localhost:3110/fr/discover`, then click "inspect" next to that tab on the Mac.
5. In the DevTools window that opens, go to the Performance panel and check the live metrics card (LCP, CLS, INP). For each route below:
   - press Record;
   - wait 3 s;
   - scroll for about 5 s;
   - do the taps listed;
   - stop;
   - write down CLS, the worst INP or interaction, and whether the Frames track shows dropped frames, i.e. red or yellow frames over 16.7 ms.

   | Route (on the phone) | Taps |
   |---|---|
   | `/fr/discover` | Livraison / À emporter switch, a cuisine chip, a favourite heart |
   | `/fr/restaurants/atelier-sidi-yahia` | a dish's "+", "Horaires d'ouverture" |
   | `/fr/dev/screens/checkout-payment` | "Montant exact", "Ajouter un code promo" |
   | `/fr/dev/screens/tracking` | "Vue 3D" (on and off), "Appeler le restaurant" |

6. Repeat once in Arabic (`/ar/...`) for Discovery and Tracking, to check the right-to-left layout on the real screen.
7. Pass: on every route, CLS < 0.05, every interaction ≤ 100 ms, and no run of dropped frames while scrolling.
8. Record the numbers and phone model in `docs/evidence/awid/perf.md` under "Physical Android check". Tell lane B about any route that fails; DevTools → Performance → "Save profile" gives a file lane B can read.

When done, run `adb reverse --remove-all` and stop the server with Ctrl+C.

## 10× local load run

To prove the k6 placement/position target without disabling production abuse limits, prepare an isolated synthetic load environment with k6 2.3.0, local production Compose dependencies, and at least 350 source IPs routed through Caddy. The default 700 combined requests/second workload needs 350 IPs at the API's shared 120 requests/minute per-IP limit. Keep all data synthetic and do not point the run at production. Then follow [the load guide](../load/README.md) to prepare 30,000 unique quotes plus 1,000 courier session/order fixtures, run `k6 run load/pilot.js` with the exact environment variables, and save the output in `docs/evidence/awid/k6/`.

## Confirm live incident delivery

- [ ] Add the AWID bot to the monitored Telegram chat and put `OPS_TELEGRAM_BOT_TOKEN` and `OPS_TELEGRAM_CHAT_ID` in the private `worker.env`. Restart the worker on the isolated staging stack and verify one Telegram message for the synthetic terminal watchdog incident. Repeat for the monitored Resend inbox using the settings above.
- [ ] Connect the operations log collector to the API container's structured output and configure a notification for `event=api.request.failed`. Trigger a synthetic API 500 on staging and confirm the event and notification arrive with the route pattern and status. Keep the request body and exception text out of the event.

- [ ] Before enabling production SMS or email, configure provider spending or usage alerts and a hard cap where supported. Confirm with the provider which controls enforce a cap versus only notify. Run a staging OTP incident to verify the configured notification reaches operations. Record the limits and result without credentials in the rate-limit inventory.
