import { z } from "./schema.js";
import { customerSmsStatus } from "./orders.js";

const providers = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com"]);
const endpoint = z
  .string()
  .max(2048)
  .refine((value) => {
    const url = URL.parse(value);
    if (!url || url.href !== value || url.protocol !== "https:" || url.port) return false;
    if (url.username || url.password || url.hash || url.pathname === "/") return false;
    return providers.has(url.hostname) || url.hostname.endsWith(".push.apple.com");
  });

export const pushPublicKey = z.string().regex(/^B[A-Za-z0-9_-]{85}[AEIMQUYcgkosw048]$/u);
export const pushPublicKeyOutput = z.strictObject({ publicKey: pushPublicKey });
export const customerPushStatus = z.enum([
  "accepted",
  "ready",
  "out_for_delivery",
  "delivered",
  "collected",
  ...customerSmsStatus.options,
]);
export const orderPushPayload = z.strictObject({
  id: z.string().min(1).max(80),
  status: customerPushStatus,
  code: z.string().min(1).max(7),
  title: z.literal("AWID"),
  body: z.string().min(1).max(200),
  url: z.enum(["/ar/orders", "/fr/orders", "/en/orders"]),
});

export const pushSubscriptionInput = z.strictObject({
  endpoint,
  keys: z.strictObject({
    p256dh: pushPublicKey,
    auth: z.string().regex(/^[A-Za-z0-9_-]{21}[AQgw]$/u),
  }),
  expirationTime: z.int().nonnegative().nullable().optional(),
});
export const removePushSubscriptionInput = z.strictObject({ endpoint });
