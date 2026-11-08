import { z } from "zod";
import { adminMerchantReviewInput } from "./admin.js";
import { adminBillingSettingsInput } from "./billing.js";
import { pageLimit } from "./pagination.js";

const uuid = z.uuid();
const instant = z.iso.datetime();
const reason = adminMerchantReviewInput.shape.reason;
const bannerText = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .refine((text) => !text.includes("\0") && !/\p{Cs}/u.test(text));
const localizedBanner = z.strictObject({ ar: bannerText, fr: bannerText, en: bannerText });
const { priceDzd, trialDays } = adminBillingSettingsInput.shape.settings.shape;
export const platformSettingValue = {
  order_accept_timeout_seconds: z.int().min(1).max(7_200),
  first_order_cash_cap_dzd: z.int().min(0).max(2_147_483_647),
  subscription_price_dzd: priceDzd,
  subscription_trial_days: trialDays,
  maintenance_banner: localizedBanner.nullable(),
};

export const platformSettingKey = z.enum([
  "order_accept_timeout_seconds",
  "first_order_cash_cap_dzd",
  "subscription_price_dzd",
  "subscription_trial_days",
  "maintenance_banner",
]);
export const adminPlatformSettingsOutput = z.strictObject({
  sessionId: uuid,
  settings: z.strictObject(platformSettingValue),
});
export const adminPlatformSettingInput = z.strictObject({
  value: z.union([z.int().nonnegative(), localizedBanner, z.null()]),
  reason,
});

const globalFeatureFlag = z.enum([
  "menu_photo_import",
  "online_payments",
  "subscription_online_payment",
  "ramadan_mode",
]);
const orderingFlag = z
  .string()
  .refine(
    (key) => key.startsWith("ordering:") && uuid.safeParse(key.slice("ordering:".length)).success,
  );
export const featureFlagKey = z.union([globalFeatureFlag, orderingFlag]);
export const adminFlagInput = z.strictObject({ isEnabled: z.boolean(), reason });
export const adminFlagOutput = z.strictObject({
  key: featureFlagKey,
  isEnabled: z.boolean(),
  scope: z.strictObject({ cityId: uuid }).nullable(),
  updatedAt: instant,
});
export const publicFlagsOutput = z.strictObject({
  flags: z.strictObject({
    menu_photo_import: z.boolean().optional(),
    online_payments: z.boolean().optional(),
    ramadan_mode: z.boolean().optional(),
    ordering: z.record(uuid, z.boolean()).optional(),
  }),
  maintenanceBanner: localizedBanner.nullable(),
});

export const adminUserActionInput = z.strictObject({ reason });
export const adminUserActionOutput = z.strictObject({
  userId: uuid,
  blockedAt: instant.nullable(),
  anonymisedAt: instant.nullable(),
});

const auditEntity = z.enum([
  "merchant",
  "item",
  "user",
  "setting",
  "flag",
  "invoice",
  "order",
  "support",
]);
const auditCursorParts = z.strictObject({ createdAt: instant, id: uuid });

export function readAdminAuditCursor(cursor: string) {
  const [createdAt, id, extra] = cursor.split("~");
  if (extra !== undefined) return undefined;
  const result = auditCursorParts.safeParse({ createdAt, id });
  return result.success ? result.data : undefined;
}

const auditCursor = z
  .string()
  .max(96)
  .refine((cursor) => readAdminAuditCursor(cursor) !== undefined);
export const adminAuditQuery = z
  .strictObject({
    actorId: uuid.optional(),
    entity: auditEntity.optional(),
    from: instant.optional(),
    to: instant.optional(),
    cursor: auditCursor.optional(),
    limit: pageLimit,
  })
  .refine(
    ({ from, to }) => from === undefined || to === undefined || Date.parse(from) < Date.parse(to),
  );

export const adminAuditOutput = z.strictObject({
  sessionId: uuid,
  events: z
    .array(
      z.strictObject({
        id: uuid,
        actorId: uuid,
        entity: auditEntity,
        entityId: z.string().min(1).max(128),
        action: z.string().min(1).max(128),
        reason,
        createdAt: instant,
      }),
    )
    .max(100),
  nextCursor: auditCursor.nullable(),
});

const supportBody = z
  .string()
  .trim()
  .min(1)
  .max(2_000)
  .refine((body) => !body.includes("\0") && !/\p{Cs}/u.test(body));
export const customerSupportInput = z.strictObject({ orderId: uuid.nullable(), body: supportBody });
export const customerSupportOutput = z.strictObject({
  supportId: uuid,
  orderId: uuid.nullable(),
  status: z.enum(["open", "replied", "closed"]),
  createdAt: instant,
});
export const adminSupportReplyInput = z.strictObject({
  body: supportBody,
  channel: z.enum(["sms", "push"]),
});
export const adminSupportReplyOutput = z.strictObject({ supportId: uuid, queuedAt: instant });
