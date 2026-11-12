import { z } from "zod";

const dinars = z.int().min(0).max(2_147_483_647);
const revision = z.int().min(0).max(Number.MAX_SAFE_INTEGER);
const zone = z.strictObject({
  radiusMeters: z.int().min(100).max(100_000),
  feeDzd: dinars,
  minimumDzd: dinars,
  travelMinutes: z.int().min(1).max(120),
});
const settings = z.strictObject({
  pickupEnabled: z.boolean(),
  deliveryEnabled: z.boolean(),
  pickupMinimumDzd: dinars,
  prepMinutes: z.int().min(5).max(120),
  zone: zone.nullable(),
});

export const merchantDeliverySettingsInput = settings
  .extend({ expectedRevision: revision })
  .refine(
    ({ deliveryEnabled, zone: configuredZone }) => !deliveryEnabled || configuredZone !== null,
    {
      path: ["zone"],
    },
  );

export const merchantDeliverySettingsOutput = z.strictObject({
  sessionId: z.uuid(),
  revision,
  settings,
});

export const merchantDeliverySettingsWriteOutput = merchantDeliverySettingsOutput.pick({
  revision: true,
});
