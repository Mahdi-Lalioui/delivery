import { z } from "zod";
import { algerianMobilePhone } from "./auth.js";
import { merchantApplicationInput } from "./merchant.js";
import { deliveryCode, orderEta, orderStatus, orderSummary } from "./orders.js";

const pin = merchantApplicationInput.shape.pin;
const timeline = z.array(z.strictObject({ status: orderStatus, at: z.iso.datetime() }));
const phone = algerianMobilePhone.nullable();
export const trackingTokenParams = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
});
export const publicTrackingOutput = z.strictObject({
  fulfilment: z.enum(["delivery", "pickup"]),
  status: orderStatus,
  customerFirstName: z.string().min(1).max(80),
  eta: orderEta.nullable(),
  timeline,
});
export const trackingPosition = pin.extend({
  heading: z.number().min(0).lt(360).optional(),
  capturedAt: z.iso.datetime(),
});
export const trackingPositionEvent = trackingPosition.extend({
  orderId: orderSummary.shape.orderId,
});
const customerTracking = z.strictObject({
  order: orderSummary,
  timeline,
  restaurantPhone: phone,
  shareToken: trackingTokenParams.shape.token.nullable(),
});
export const customerTrackingOutput = z.discriminatedUnion("fulfilment", [
  customerTracking.extend({
    fulfilment: z.literal("pickup"),
    pickupPin: pin,
    pickupCode: orderSummary.shape.shortCode,
  }),
  customerTracking.extend({
    fulfilment: z.literal("delivery"),
    destination: pin,
    deliveryCode: deliveryCode.nullable(),
    courier: z
      .strictObject({
        firstName: z.string().min(1).max(80).nullable(),
        phone,
        position: trackingPosition.nullable(),
      })
      .nullable(),
    route: z.array(pin).max(5000).nullable(),
  }),
]);
