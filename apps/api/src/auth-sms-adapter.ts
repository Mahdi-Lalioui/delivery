import type { PublicLocale } from "@zaafran/i18n/locales";
import { invitationCopy, otpCopy } from "./message-copy.js";

type Gateway = { url: string; token: string; publicOrigin: string };
type Delivery = { phone: string; deliveryKey: string; locale?: PublicLocale };
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

  return createSmsMessages(deliver, publicOrigin);
}

export function createSmsMessages(deliver: (message: Sms) => Promise<void>, publicOrigin: string) {
  return {
    sendOtp: ({ phone, code, deliveryKey, locale }: Delivery & { code: string }) =>
      deliver({ to: phone, text: otpCopy(locale, code).text, key: "otp:" + deliveryKey }),
    sendInvitation: ({ phone, token, deliveryKey, locale }: Delivery & { token: string }) =>
      deliver({
        to: phone,
        text: invitationCopy({ publicOrigin, token, locale, kind: "staff" }).text,
        key: "invite:" + deliveryKey,
      }),
    sendCourierInvitation: ({ phone, token, deliveryKey, locale }: Delivery & { token: string }) =>
      deliver({
        to: phone,
        text: invitationCopy({ publicOrigin, token, locale, kind: "courier" }).text,
        key: "courier-invite:" + deliveryKey,
      }),
  };
}
