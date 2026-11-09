# Privacy engineering inventory

Draft for the engineering team. Complete retention rules, processor agreements and customer-facing language in the privacy milestone and obtain legal review before launch.

| Data class | Intended use | Retention decision |
|---|---|---|
| OTP challenges and sessions | Authenticate and revoke access | Confirm OTP and expired session cleanup in M7 |
| Address, pin and voice note | Fulfill the customer's order | Apply the SPEC retention windows and prove deletion jobs |
| Courier position events | Live tracking and delivery support | Apply the SPEC position cleanup and access controls |
| Order and billing records | Fulfillment, accounting and audit | Record the approved accounting retention and anonymization rules |
| First-party analytics | Operational reporting | Confirm fields, aggregation and deletion behavior before launch |
| Development data | Local tests, fixture maps and fake inboxes | Keep fixtures synthetic and drop test database clones after each suite |

Record each processor, the fields it receives, access controls, deletion behavior and evidence when its adapter ships. Account export, deletion, anonymization and the retention jobs are tracked in PLAN M7.

## Customer account deletion

The customer requests a fresh OTP for the phone already on the account. The challenge and
its send receipt expire together. The server caps incorrect attempts and rate-limits sends
by account and keyed IP digest. A completed request can be replayed only with the original
session credential, challenge and OTP, within the challenge lifetime.

Successful deletion removes the account phone and revokes every stored web and bearer
session. Deletion removes redeemable sign-in challenges while their keyed rate history
remains for the existing throttle windows. A worker removes unattached application
media records and recorded objects after queued image processing, and prunes expired
privacy proofs and rate history. The audit record keeps the opaque account ID, action
and timestamp. Accounts
linked to privileged roles require a separate workflow. Future persistence for customer
addresses, orders, ratings, refresh tokens and push subscriptions must include export,
anonymization or revocation in the same privacy workflow. Order accounting records must
retain financial data with personal fields removed.

Storage reconciliation still needs to cover historical unpublished objects whose keys
were never recorded, and quarantine cleanup when the storage provider rejects a
definitive upload discard.
