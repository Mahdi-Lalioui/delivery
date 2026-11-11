import { expect, test, vi } from "vitest";
import { createStaffInvitationToken } from "../src/auth-crypto.ts";
import { createAuthSmsAdapter } from "../src/auth-sms-adapter.ts";

const configuration = {
  url: "https://sms.example.test/messages",
  token: "fake".repeat(8),
  publicOrigin: "https://awid.example.test",
};
const phone = "+213500000000";
const deliveryKey = "test-id";

test("sends sign-in and privacy codes with a stable provider delivery key", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
  const sender = createAuthSmsAdapter(configuration, fetcher);
  await sender.sendOtp({ phone, code: "001234", deliveryKey });
  const [call] = fetcher.mock.calls;
  expect(call?.[0]).toBe(configuration.url);
  expect(call?.[1]).toMatchObject({
    method: "POST",
    redirect: "error",
    headers: {
      authorization: "Bearer " + configuration.token,
      "content-type": "application/json",
      "idempotency-key": "otp:" + deliveryKey,
    },
    body: JSON.stringify({ to: phone, text: "AWID · Code : 001234" }),
  });
});

test("keeps the invitation token in the link fragment and never surfaces provider details", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response("private provider body", { status: 502 }));
  const sender = createAuthSmsAdapter(configuration, fetcher);
  const invitation = { phone, token: "fixture-secret", deliveryKey };
  await sender.sendInvitation(invitation);
  const [call] = fetcher.mock.calls;
  expect(call?.[1]).toMatchObject({
    headers: { "idempotency-key": "invite:" + deliveryKey },
    body: JSON.stringify({
      to: phone,
      text: "AWID · Invitation : https://awid.example.test/fr/staff/accept#token=fixture-secret",
    }),
  });
  await expect(sender.sendInvitation(invitation)).rejects.toThrow(
    "SMS gateway rejected the request",
  );
});

test("recovers the same invitation token across retries and scopes it to merchant and owner", () => {
  const scope = {
    key: Buffer.alloc(32, 1),
    merchantId: "merchant-a",
    accountId: "owner-a",
    idempotencyKey: "retry-key",
  };
  const token = createStaffInvitationToken(scope);
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  expect(createStaffInvitationToken(scope)).toBe(token);
  expect(createStaffInvitationToken({ ...scope, merchantId: "merchant-b" })).not.toBe(token);
  expect(createStaffInvitationToken({ ...scope, accountId: "owner-b" })).not.toBe(token);
  expect(createStaffInvitationToken({ ...scope, idempotencyKey: "another-key" })).not.toBe(token);
});
