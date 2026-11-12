import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext } from "@playwright/test";
import { requestOtpOutput, verifyOtpOutput } from "../packages/contracts/src/auth.ts";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";

export function sessionCommand(origin: string) {
  return { origin, "idempotency-key": randomUUID() };
}

export async function authenticate(
  request: APIRequestContext,
  harness: AuthHarness,
  { phone, admin = false }: { phone: string; admin?: boolean },
) {
  const { origin } = harness;
  const totp = admin ? await harness.seedAdmin(phone) : undefined;
  const challenge = await request.post(origin + "/v1/auth/otp/request", {
    headers: sessionCommand(origin),
    data: { phone, purpose: admin ? "admin_sign_in" : "sign_in" },
  });
  expect(challenge.status()).toBe(202);
  const { challengeId } = requestOtpOutput.parse(await challenge.json());
  const verified = await request.post(origin + "/v1/auth/otp/verify", {
    headers: sessionCommand(origin),
    data: { challengeId, code: harness.latestSms(phone), transport: "web" },
  });
  expect(verified.status()).toBe(200);
  const output = verifyOtpOutput.parse(await verified.json());
  if (totp) {
    if (output.status !== "totp_required") throw new Error("Expected the admin second factor.");
    const second = await request.post(origin + "/v1/auth/totp/verify", {
      headers: sessionCommand(origin),
      data: { challengeId: output.challengeId, code: totp(), transport: "web" },
    });
    expect(second.status()).toBe(200);
  } else {
    expect(output.status).toBe("authenticated");
  }
}
