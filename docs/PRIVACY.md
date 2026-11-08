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
