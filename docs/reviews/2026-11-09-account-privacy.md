# Account privacy review

- [x] **P1 — A privileged account can also sign in with a standard session.** A customer
  deletion request must not remove an admin, merchant or courier identity through its
  standard session. Cover the repository authorization decision with a regression.

- [x] **P1 — Lane B can report deletion after a failed request and a 401 or 403.**
  Show success only after HTTP 204, including a verified replay. Test a lost response
  followed by each denial before exercising the real confirmation.

- [x] **P1 — Account deletion resets the sign-in OTP throttle.** Keep the active
  rate windows in anonymized history when removing redeemable sign-in challenges.

- [x] **P1 — Unattached application images survive deletion.** Erase their objects
  and records through a durable job on the same queue as media preparation and cropping.

- [x] **P1 — A successful deletion just before OTP expiry has too little replay time.**
  Keep a separate five-minute proof window after successful deletion while keeping the
  issuance key tied to OTP expiry. The Postgres regression covers both deadlines.
