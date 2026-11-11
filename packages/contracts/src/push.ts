import { z } from "zod";

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

export const pushSubscriptionInput = z.strictObject({
  endpoint,
  keys: z.strictObject({
    p256dh: z.string().regex(/^B[A-Za-z0-9_-]{85}[AEIMQUYcgkosw048]$/u),
    auth: z.string().regex(/^[A-Za-z0-9_-]{21}[AQgw]$/u),
  }),
  expirationTime: z.int().nonnegative().nullable().optional(),
});
export const removePushSubscriptionInput = z.strictObject({ endpoint });
