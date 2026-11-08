# M2 staff invitations evidence (MER-23)

`pnpm exec playwright test --config e2e/auth.config.ts --grep @merchant-staff` passed the production-build journey in `e2e/auth-merchant-staff.spec.ts` (7.5 s).

1. The owner (`+213550000281`) opens the team page from **Gérer l’équipe** on `/fr/merchant`. A two-digit phone shows the phone error and focuses the field.
2. The owner invites `0550 00 02 83` as manager and revokes it. The status reads "Invitation annulée" and the revoke button is gone.
3. The owner invites `0550 00 02 82` as staff, and the invitation is listed.
4. In a second context, the signed-out invitee opens `/fr/staff/accept#token=…`. The fragment is cleared from the URL. The page asks the invitee to sign in. The OTP sign-in returns through **Ouvrir l’invitation**, and the page announces the restaurant with the role "Employé".
5. Opening the same link in a fresh tab shows "Cette invitation n’est plus valable…".
6. The invitee's `/fr/merchant` lists the restaurant without a team link. After a reload, the owner sees the new member and no pending invitations.

The first run failed at step 5: the replay reused the same tab, so the hash-only navigation did not reload the page. The replay now opens a new tab, as a second tap on the SMS link would.

The matrix (ar/fr × light/dark × 390×844 / 1280×800) was captured after the invitation was sent. All 8 cases have zero axe WCAG A/AA/2.1/2.2 AA violations and no horizontal overflow. [Lossless captures](merchant-staff/)

Design notes (P2, for the M2-12 design critic):
- The phone hint renders at label weight.
- Each radio's role hint sits inline after the role name. It should be secondary text on its own line.
- The radio rows have uneven vertical gaps.

Not covered: 768×1024, 200% text and a separate design-critic review.
