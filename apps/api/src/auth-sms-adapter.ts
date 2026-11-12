type Gateway = { url: string; token: string; publicOrigin: string };
type Delivery = { phone: string; deliveryKey: string };
type Sms = { to: string; text: string; key: string };

export function createAuthSmsAdapter({ url, token, publicOrigin }: Gateway, send = fetch) {
  async function deliver({ to, text, key }: Sms) {
    const response = await send(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify({ to, text }),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error("SMS gateway rejected the request");
  }

  return {
    sendOtp: ({ phone, code, deliveryKey }: Delivery & { code: string }) =>
      deliver({ to: phone, text: "AWID · Code : " + code, key: "otp:" + deliveryKey }),
    sendInvitation: ({
      phone,
      token: invitationToken,
      deliveryKey,
    }: Delivery & { token: string }) => {
      const invitation = new URL("/fr/staff/accept", publicOrigin);
      invitation.hash = new URLSearchParams({ token: invitationToken }).toString();
      return deliver({
        to: phone,
        text: "AWID · Invitation : " + invitation.href,
        key: "invite:" + deliveryKey,
      });
    },
  };
}
