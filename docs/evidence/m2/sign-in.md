# M2 sign-in UI evidence

The optimized Next.js build rendered the twelve Arabic/French, light/dark and phone/tablet/desktop combinations. The Chromium pass recorded zero axe violations and no horizontal overflow. The WebP files preserve the original capture pixels. [Screenshot matrix](sign-in/)

A separate WebKit flow with stubbed responses exercised local and international phone input, OTP digit normalization, pending states, the resend deadline, stable request keys after an uncertain response, the wrong-code message and admin TOTP. The integrated Chromium suite also passed both journeys against the compiled API and disposable Postgres over local HTTPS. It checked E.164 storage, cookie attributes and CSRF, then advanced the clock until the admin session expired while the customer session in a separate browser context stayed active.

The design critic approved the twelve initial phone-entry layouts. Review found that the OTP and authenticator steps reused a focused field. The form now replaces the field between steps, moves focus to the new input, and associates its instructions and any error using `aria-describedby`. The focused unit regression passed after the fix.
