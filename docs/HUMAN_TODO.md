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
- [ ] Staging VPS for the connected web release. Provision Ubuntu LTS with Docker Compose, a static IPv4, at least 4 GB RAM and 80 GB disk. Open TCP 80/443. Create a deployment account with access to the AWID Docker project and install its public SSH key. Share the host and deployment username or the credential reference. Set up the file paths and map data in [DEPLOY.md](DEPLOY.md) and [MAPS.md](../infra/MAPS.md).
- [ ] Connect the AWID web project in the Vercel team. Import `Mahdi-Lalioui/delivery` with Root Directory `apps/web` and workspace access. Give the staging environment a stable alias, then set its `ZAAFRAN_API_ORIGIN` to the API's TLS origin. Share the project and alias so cookies, media and SSE can be verified against the connected deployment. See [DEPLOY.md](DEPLOY.md).
- [ ] **[before launch]** Production VPS **hosted in Algeria**: 4 vCPU / 8–16 GB / 160 GB SSD, Ubuntu LTS.
- [ ] **[before launch]** Second backup location for encrypted backups.

## Providers
- [ ] **[before launch, if using the webhook instead of Twilio]** Connect the authentication SMS gateway. Register a transactional sender ID and configure an HTTPS endpoint that accepts bearer authentication, a JSON body with `to` and `text`, and `Idempotency-Key` deduplication. Put its endpoint and credential in `AUTH_SMS_WEBHOOK_URL` and `AUTH_SMS_WEBHOOK_TOKEN` in the API secret file. Confirm sign-in, deletion and staff-invitation delivery on approved Mobilis, Djezzy and Ooredoo test numbers. [Gateway contract](DEPLOY.md#sms-webhook)
- [ ] **[phone/email phase]** Open the Twilio Console, enable sending to Algeria, and register a branded domestic alphanumeric sender for AWID. Request it early. Twilio lists a two-week provisioning estimate and flags delivery problems with generic or numeric senders on Mobilis. After approval, put the account SID, auth token and sender into the API and worker secret files, then verify delivery on approved Mobilis, Djezzy and Ooredoo test numbers. [Twilio Algeria SMS guidelines](https://www.twilio.com/en-us/guidelines/dz/sms)
- [ ] **[phone/email phase]** Add an AWID-owned transactional subdomain to Resend. Publish the exact SPF and DKIM records shown in its Domains dashboard and wait for Verified status. Create a sending key scoped to the domain, put it and the sender address in the API and worker secret files, and confirm Arabic, French and English OTP emails on approved test inboxes. [Resend domain setup](https://resend.com/docs/dashboard/domains/introduction)
- [ ] Telegram bot token (or an email address) for alerts.
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

- [ ] **[team preview]** Import `Mahdi-Lalioui/delivery` in the team’s Vercel account and deploy
  `lane-a` as Preview. Set the Root Directory to `apps/web`, enable access to workspace
  packages and system environment variables, and set `ZAAFRAN_PREVIEW_DEMO=1` for Preview
  only. See [team preview steps](TEAM_PREVIEW.md) for Node, build, and opening the demo.

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
