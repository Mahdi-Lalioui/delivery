# Lane B request: account deletion challenge (CUS-24)

Requested 2026-11-08. `customerPrivacyDeleteInput` needs a `challengeId`, but the auth contract has
no OTP purpose for account deletion. Lane B's client (`apps/web/src/retention/privacy/`) calls:

| Method | Path | Body → Response | Notes |
|---|---|---|---|
| POST | `/v1/me/deletion-challenge` | → `{ challengeId, expiresAt }` (201) | Idempotency-Key; OTP to the account's own phone; rate-limited (429) |
| DELETE | `/v1/me` | `customerPrivacyDeleteInput` → 204 | 400 `invalid_code`, 409 `challenge_expired`; anonymises per PRIVACY.md and revokes all sessions |
| GET | `/v1/me/export` | → `customerPrivacyExportOutput` | already in the contract |

Please add an `account_delete` purpose (or tell lane B the route you prefer) and a contract for the
challenge response. Deletion must revoke every session, so the client shows a final "deleted" page
without further API calls.

## Safety requirements (from lane B's review)
- **Idempotent DELETE per `challengeId`:** a replay of a successful deletion returns 204, so a client
  that lost the first response learns the outcome. Lane B also treats a 401 after an unanswered
  DELETE as "already deleted".
- **Attempt cap:** at most 5 wrong codes per challenge, then the challenge is burned (409
  `challenge_expired`).
- **Send limits:** per account and per IP, with a resend cooldown; 429 when exceeded.
- **Idempotency-Key scope:** account + purpose, TTL no longer than the challenge expiry; the challenge
  is bound to the session's account.
- **On success:** write an audit entry, revoke every session, refresh token and push token, then
  anonymise per `docs/PRIVACY.md`.
