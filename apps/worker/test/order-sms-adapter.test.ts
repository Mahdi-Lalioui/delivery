import { expect, test, vi } from "vitest";
import { createOrderSmsAdapter } from "../src/order-sms-adapter.ts";

const message = {
  recipient: "+213500000001",
  text: "Commande K7M-4QX expirée.",
  key: "order:fixture:2",
};

test("[NOT-01] uses a stable delivery key and never follows redirects", async () => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
  const adapter = createOrderSmsAdapter(
    { url: "https://sms.example.test/send", token: "fixture-token" },
    send,
  );
  await adapter(message);
  expect(send).toHaveBeenCalledExactlyOnceWith(
    "https://sms.example.test/send",
    expect.objectContaining({
      method: "POST",
      redirect: "error",
      headers: {
        authorization: "Bearer fixture-token",
        "content-type": "application/json",
        "idempotency-key": message.key,
      },
      body: JSON.stringify({ to: message.recipient, text: message.text }),
    }),
  );
});

test("[NOT-01] treats a gateway failure as retryable without exposing the response body", async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(message.recipient, { status: 503 }));
  const adapter = createOrderSmsAdapter(
    { url: "https://sms.example.test/send", token: "fixture-token" },
    send,
  );
  await expect(adapter(message)).rejects.toThrow("SMS gateway rejected the request");
});
