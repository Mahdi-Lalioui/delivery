# Lane B handoff for merchant application notices

Lane A owns the shared contract, repository, and API. Lane B owns the admin console and its localized messages.

- Read `GET /v1/admin/merchant-applications/notice` with the existing admin session. Parse with `adminMerchantNoticeOutput` from `@zaafran/contracts/admin`. The response is uncached and includes `sessionId`, `pendingCount`, and `latestMerchantId`. Compare the session with the queue session before showing the notice. A zero count has a null latest ID.
- Show a localized, accessible pending notice in the admin console. Refresh it while the console is visible and after an approval or rejection. Keep it independent of the queue rows and the review form so a new application preserves a review in progress.
- In the production browser test, start with an already open admin console and a separate applicant. Submit the application and prove the notice appears without a reload. Review the application and confirm that the notice clears. Keep Arabic, French, and English messages in Lane B’s namespace.

Open review details through the existing paged queue. [Decision D-021](../DECISIONS.md#d-021--in-app-merchant-application-notices)
