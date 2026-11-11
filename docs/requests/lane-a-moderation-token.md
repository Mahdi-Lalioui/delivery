# Lane B handoff for repeat moderation reviews

Request `GET /v1/admin/menu-items/held?includeReviewToken=1` and include the selected row’s `reviewToken` in its review command. The token is tied to the displayed names, descriptions and review cycle. On `409 stale_review`, reload the queue and ask the reviewer to read the current text again. Keep the token in the write fingerprint so an exact retry uses the original token and key.

The legacy admin UI can complete a first hold. A subsequent hold requires the token. Prove both a stale decision rejection and a fresh decision from the queue in the admin browser flow.
