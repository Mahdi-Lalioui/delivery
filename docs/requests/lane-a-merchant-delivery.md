# Merchant delivery radius

Lane A implements GET and PUT `/v1/merchants/:merchantId/delivery-settings`. Owners and managers use their existing session. The write takes the usual expected-session and idempotency headers, plus the current merchant revision. It saves pickup and delivery modes, pickup minimum, kitchen prep time and a single radius around the restaurant entrance, with the radius’s flat fee, minimum order and travel estimate. The restaurant may disable delivery and retain the radius settings.

Existing admin zones remain available with their priority. Public ordering continues to require an active platform service area. The current sprint covers the radius and flat fee. Polygon editing and additional pricing rules remain under MER-17.
