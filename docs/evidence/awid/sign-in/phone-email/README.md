# Phone and email design review

The Playwright journey uses synthetic data and the production web build. Each capture passed axe and the viewport overflow assertion. The four configurations cover Arabic and French at 390 px, French at 1280 px and Arabic dark mode at 390 px.

| Screen | First review | Second review |
| --- | --- | --- |
| Sign-in | The narrow method picker left an uneven edge, the phone label leaked into the email code step, the photo used too much of the shorter mobile viewport, the field needed email autofill, and Arabic needed a legible LTR destination. | The picker aligns to the form, the shorter image keeps the action higher, and the email address and six-digit code have separate localized labels and autofill. The test verifies uppercase normalization, the resend countdown and focus. |
| Account | At 390 px the email broke across lines, the badge competed with the action, the row separator was invisible, the unverified state was hard to scan, and there was no visible completion feedback. | The badge moved next to its label, the email has more room, separators use the shared border color, and the Add/Change editor announces verification and completion. |
| Checkout | The contact and cash panels looked identical, the contact field was too wide on desktop, its purpose needed a hint, the required state was hard to tell, and the submit action needed to stay visible while users checked the total. | The contact field has a narrower desktop measure, a distinct surface and a required state. The sticky action stays visible. The browser test checks that it unlocks after a valid contact number and places the real order. |

[Account captures](../../account/phone-email/) · [Checkout captures](../../checkout/phone-email/)
