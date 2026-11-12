# Admin live orders

The admin web console uses `POST /v1/admin/orders/search` for a bounded live queue, status filters and searches by exact short code, exact E.164 phone or restaurant name. The phone filter is in the request body. The search returns a session-bound cursor page without customer or courier contact data.

`GET /v1/admin/orders/:orderId/timeline` returns the current order and its latest events with actor role and reason. Use the existing `POST /v1/orders/:orderId/force` state transition with an idempotency key, the displayed order version, the expected admin session and an explicit reason. The UI will offer the terminal status appropriate to the fulfilment mode.
