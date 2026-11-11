type Gateway = { url: string; token: string };
type Message = { recipient: string; text: string; key: string };

export type SendOrderSms = (message: Message) => Promise<void>;

export function createOrderSmsAdapter({ url, token }: Gateway, send = fetch): SendOrderSms {
  return async ({ recipient, text, key }) => {
    const response = await send(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify({ to: recipient, text }),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error("SMS gateway rejected the request");
  };
}

export async function unavailableOrderSms(): Promise<never> {
  return Promise.reject(new Error("Order SMS gateway is unavailable"));
}
