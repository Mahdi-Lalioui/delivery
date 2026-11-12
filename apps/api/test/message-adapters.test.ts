import { expect, test, vi } from "vitest";
import { createResendSender, createTwilioSender } from "../src/message-adapters.ts";
import { otpCopy } from "../src/message-copy.ts";

test("sends a localized SMS using Twilio form fields and Basic credentials", async () => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 201 }));
  const accountSid = "AC" + "a".repeat(32);
  const sender = createTwilioSender({ accountSid, authToken: "synthetic", from: "AWID" }, send);
  const text = otpCopy("ar", "001234").text;
  await sender({ to: "+213500000000", text, key: "otp:fixture" });
  const [call] = send.mock.calls;
  expect(call?.[0]).toBe(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`);
  expect(call?.[1]).toMatchObject({
    method: "POST",
    redirect: "error",
    headers: {
      authorization: "Basic " + Buffer.from(accountSid + ":synthetic").toString("base64"),
    },
  });
  expect(call?.[1]?.body).toEqual(
    new URLSearchParams({ From: "AWID", To: "+213500000000", Body: "AWID · رمز التحقق: 001234" }),
  );
});

test("sends plain text and HTML with a stable Resend key and keeps provider errors private", async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockResolvedValueOnce(new Response("provider data must stay private", { status: 403 }));
  const from = "AWID <auth@example.test>";
  const sender = createResendSender({ apiKey: "synthetic", from }, send);
  const message = { ...otpCopy("en", "001234"), to: "buyer@example.test", key: "otp:fixture" };
  await sender(message);
  const [call] = send.mock.calls;
  expect(call?.[0]).toBe("https://api.resend.com/emails");
  expect(call?.[1]).toMatchObject({
    method: "POST",
    redirect: "error",
    headers: { authorization: "Bearer synthetic", "idempotency-key": "otp:fixture" },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });
  expect(message.text).toBe("AWID · Your code: 001234");
  expect(message.html).toContain("001234");
  expect(otpCopy("fr", "001234").text).toBe("AWID · Code : 001234");
  await expect(sender(message)).rejects.toThrow(/^Email provider rejected the request$/);
});
