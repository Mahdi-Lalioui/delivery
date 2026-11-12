# Lane A ownership of phone and email sign-in

Mahdi assigned the backend and the sign-in, account and checkout screens to Lane A on 2026-11-12. Lane B should route changes to those screens through Lane A. The work starts after the current web release checks, from the latest Lane B design merged into the release candidate.

1. Publish backward-compatible auth and contact-phone contracts, then migrate existing phone accounts and add normalized verified emails. Keep the existing sessions and admin TOTP.
2. Extend OTP, identifier linking and account deletion, with tests for enumeration, limits, lockout, one-use codes, concurrent linking and cross-account access.
3. Add Twilio, Resend and inspectable local fakes. Publish the enabled methods and switch staff/courier invitations and order status notifications to verified channels.
4. Connect the sign-in method switch, code input and resend state, the account Add/Change flows and the checkout contact phone. Keep the first-order cash cap.
5. Verify phone and email journeys, permissions and privacy, and run the AWID design loop in Arabic and French. Publish provider setup and deployment evidence.

The Twilio and Resend account and DNS steps are in [HUMAN_TODO](../HUMAN_TODO.md).

## Published contracts

The new schemas are available on Lane A. Route wiring follows in the authentication phase.

| Endpoint | Contract |
| --- | --- |
| `GET /v1/auth/methods` | `authMethodsOutput` |
| `POST /v1/auth/otp/request` | `requestIdentifierOtpInput` → existing `requestOtpOutput` |
| `GET /v1/me/identifiers` | `verifiedIdentifiersOutput` |
| `POST /v1/me/identifiers/challenge` | `changeIdentifierChallengeInput` → `requestOtpOutput` |
| `PUT /v1/me/identifiers` | `changeIdentifierInput` → `verifiedIdentifiersOutput` |
| `POST /v1/orders` | `orderPlacementWithContactInput` → existing `orderSummary` |
