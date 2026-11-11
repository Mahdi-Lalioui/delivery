import { expect, test } from "vitest";
import { pushSubscriptionInput } from "../src/push.ts";

const keys = { p256dh: "B" + "A".repeat(86), auth: "A".repeat(22) };

test("[NOT-04] accepts supported HTTPS browser endpoints and bounded base64url keys", () => {
  for (const endpoint of [
    "https://fcm.googleapis.com/fcm/send/fixture",
    "https://updates.push.services.mozilla.com/wpush/v2/fixture",
    "https://web.push.apple.com/Qfixture",
  ]) {
    expect(pushSubscriptionInput.parse({ endpoint, keys, expirationTime: null })).toEqual({
      endpoint,
      keys,
      expirationTime: null,
    });
  }
});

test("[NOT-03] rejects untrusted destinations, credentials, ports, invalid keys and identity fields", () => {
  const endpoint = "https://fcm.googleapis.com/fcm/send/fixture";
  for (const value of [
    { endpoint: "https://127.0.0.1/push", keys },
    { endpoint: "https://fcm.googleapis.com.invalid/push", keys },
    { endpoint: "http://fcm.googleapis.com/push", keys },
    { endpoint: "https://me:token@fcm.googleapis.com/push", keys },
    { endpoint: "https://fcm.googleapis.com:8080/push", keys },
    { endpoint, keys: { ...keys, auth: "too-short" } },
    { endpoint, keys, userId: "01932f18-3150-7c33-8a7a-53acfd343001" },
  ]) {
    expect(pushSubscriptionInput.safeParse(value).success).toBe(false);
  }
});
