import { expect, test, vi } from "vitest";
import type { sendNotification } from "web-push";
import { createOrderPushAdapter } from "../src/order-push-adapter.ts";

const endpoint = "https://fcm.googleapis.com/fcm/send/fixture";
const subscription = { endpoint, keys: { p256dh: "B" + "A".repeat(86), auth: "A".repeat(22) } };
const notification = {
  id: "order-fixture:2",
  status: "accepted",
  code: "K7M-4QX",
  title: "AWID",
  body: "Commande acceptée",
  url: "/fr/orders",
} as const;
const vapid = { subject: "mailto:ops@example.test", publicKey: "fixture", privateKey: "fixture" };

test("[NOT-03] sends only the order update and uses a repeatable browser notification topic", async () => {
  const send = vi.fn<typeof sendNotification>().mockResolvedValue({
    statusCode: 201,
    body: "",
    headers: {},
  });
  const adapter = createOrderPushAdapter(vapid, send);
  expect(await adapter(subscription, notification)).toBe("sent");
  expect(send).toHaveBeenCalledExactlyOnceWith(
    subscription,
    JSON.stringify(notification),
    expect.objectContaining({
      vapidDetails: vapid,
      TTL: 900,
    }),
  );
  expect(send.mock.calls[0]?.[2]?.topic).toMatch(/^[\w-]{32}$/u);
  await adapter(subscription, notification);
  expect(send.mock.calls[0]?.[2]?.topic).toBe(send.mock.calls[1]?.[2]?.topic);
});

test("[NOT-04] expires revoked endpoints and hides gateway errors", async () => {
  const send = vi
    .fn<typeof sendNotification>()
    .mockRejectedValueOnce({ statusCode: 410, endpoint })
    .mockRejectedValueOnce({ statusCode: 503, endpoint });
  const adapter = createOrderPushAdapter(vapid, send);
  expect(await adapter(subscription, notification)).toBe("gone");
  await expect(adapter(subscription, notification)).rejects.toThrow(
    "Web Push gateway rejected the request",
  );
});

test("[NOT-03] refuses to contact an untrusted stored push endpoint", async () => {
  const send = vi.fn<typeof sendNotification>();
  const adapter = createOrderPushAdapter(vapid, send);
  expect(await adapter({ ...subscription, endpoint: "https://127.0.0.1/push" }, notification)).toBe(
    "gone",
  );
  expect(send).not.toHaveBeenCalled();
});
