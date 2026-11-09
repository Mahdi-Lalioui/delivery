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
- [ ] Staging VPS (any provider; synthetic data only): 2 vCPU / 4 GB / 80 GB, Ubuntu LTS. Give Codex a deploy SSH key with limited rights.
- [ ] **[before launch]** Production VPS **hosted in Algeria**: 4 vCPU / 8–16 GB / 160 GB SSD, Ubuntu LTS.
- [ ] **[before launch]** Second backup location for encrypted backups.

## Providers
- [ ] **[before launch]** SMS gateway for login. In the provider console, register a transactional sender ID, enable its HTTPS send endpoint and request the delivery and idempotency documentation. Put the provider credential in the deployment secret store and share the credential reference and sender ID so the production adapter can be configured. Use approved test numbers on Mobilis, Djezzy and Ooredoo to confirm delivery before opening signup. Development and automated checks use the local fake inbox.
- [ ] Telegram bot token (or an email address) for alerts.
- [ ] Chargily Pay account, for restaurants paying their subscription online (optional at launch).
- [ ] (Optional) LLM API key, for menu import from photos (feature flag `menu_photo_import`).

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
