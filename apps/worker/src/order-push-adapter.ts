import { createHash } from "node:crypto";
import { pushSubscriptionInput, type orderPushPayload } from "@zaafran/contracts/push";
import { sendNotification, type PushSubscription, type RequestOptions } from "web-push";

type VapidDetails = NonNullable<RequestOptions["vapidDetails"]>;

type OrderPushPayload = ReturnType<typeof orderPushPayload.parse>;
export type SendOrderPush = (
  subscription: PushSubscription,
  notification: OrderPushPayload,
) => Promise<"sent" | "gone">;

export function createOrderPushAdapter(
  vapid: VapidDetails,
  send = sendNotification,
): SendOrderPush {
  return async (subscription, notification) => {
    if (!pushSubscriptionInput.safeParse(subscription).success) return "gone";
    try {
      await send(subscription, JSON.stringify(notification), {
        vapidDetails: vapid,
        TTL: 900,
        timeout: 5_000,
        urgency: "normal",
        topic: createHash("sha256").update(notification.id).digest("base64url").slice(0, 32),
      });
      return "sent";
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "statusCode" in error &&
        (error.statusCode === 404 || error.statusCode === 410)
      )
        return "gone";
      // Upstream errors can contain the private endpoint or request headers.
      // eslint-disable-next-line preserve-caught-error
      throw new Error("Web Push gateway rejected the request");
    }
  };
}

export function unavailableOrderPush(): Promise<never> {
  return Promise.reject(new Error("Web Push gateway is unavailable"));
}
