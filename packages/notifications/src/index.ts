type SmsMessage = { to: string; text: string; key: string };
type EmailMessage = SmsMessage & { subject: string; html: string };
type TwilioSettings = { accountSid: string; authToken: string; from: string };
type ResendSettings = { apiKey: string; from: string };

export function createTwilioSender({ accountSid, authToken, from }: TwilioSettings, send = fetch) {
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  return async ({ to, text }: SmsMessage) => {
    const response = await send(endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
      headers: { authorization: `Basic ${credentials}` },
      body: new URLSearchParams({ From: from, To: to, Body: text }),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error("SMS provider rejected the request");
  };
}

export function createResendSender({ apiKey, from }: ResendSettings, send = fetch) {
  return async ({ to, subject, text, html, key }: EmailMessage) => {
    const response = await send("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error("Email provider rejected the request");
  };
}
