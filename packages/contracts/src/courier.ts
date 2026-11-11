import { z } from "zod";
import { addressOutput } from "./addresses.js";
import { algerianMobilePhone } from "./auth.js";
import { merchantApplicationInput } from "./merchant.js";
import { orderSummary } from "./orders.js";

const pin = merchantApplicationInput.shape.pin;
const instant = z.iso.datetime();
const uuid = z.uuid();

export const courierInviteInput = z.strictObject({ phone: algerianMobilePhone });
export const courierInviteOutput = z.strictObject({ inviteId: uuid, expiresAt: instant });
export const courierInviteAcceptInput = z.strictObject({ inviteId: uuid });
export const courierInviteAcceptOutput = z.strictObject({ courierId: uuid, merchantId: uuid });
export const courierPresenceInput = z.strictObject({ online: z.boolean() });

export const courierJobsOutput = z.strictObject({
  jobs: z.array(
    z.strictObject({
      order: orderSummary,
      pickup: z.strictObject({ pin, restaurantName: z.string().min(1).max(120) }),
      dropoff: addressOutput.omit({ label: true, isDefault: true, addressId: true }),
      customerFirstName: z.string().min(1).max(80),
      customerPhone: algerianMobilePhone.nullable(),
      changeDzd: z.int().min(0).max(10_000),
    }),
  ),
});

export const courierPosition = pin.extend({
  accuracyM: z.number().min(0).max(100),
  heading: z.number().min(0).lt(360).optional(),
  capturedAt: instant,
});
export const courierPositionsInput = z.strictObject({
  orderId: uuid,
  positions: z.array(courierPosition).min(1).max(50),
});
export const courierPositionsOutput = z.strictObject({ accepted: z.int().min(0).max(50) });
