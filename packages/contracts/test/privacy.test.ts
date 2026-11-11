import { expect, test } from "vitest";
import { otpPurpose, requestOtpInput } from "../src/auth.ts";
import {
  customerPrivacyChallengeOutput,
  customerPrivacyDeleteInput,
  customerPrivacyDeleteOutput,
  customerPrivacyExportOutput,
} from "../src/retention.ts";

const id = "01932f18-3150-7c33-8a7a-53acfd343001";

test("[CUS-24] isolates the account deletion purpose from public sign-in", () => {
  expect(otpPurpose.parse("account_delete")).toBe("account_delete");
  expect(
    requestOtpInput.safeParse({ purpose: "account_delete", phone: "+213500000000" }).success,
  ).toBe(false);
});

test("[CUS-24] validates the challenge, confirmation, empty response and export", () => {
  expect(
    customerPrivacyChallengeOutput.parse({ challengeId: id, expiresAt: "2026-11-09T12:00:00Z" }),
  ).toHaveProperty("challengeId", id);
  expect(
    customerPrivacyChallengeOutput.safeParse({ challengeId: id, expiresAt: "later" }).success,
  ).toBe(false);
  expect(customerPrivacyDeleteInput.safeParse({ challengeId: id, code: "12345" }).success).toBe(
    false,
  );
  const empty = customerPrivacyDeleteOutput.safeParse(undefined);
  expect(empty.success).toBe(true);
  expect(
    customerPrivacyExportOutput.parse({
      profile: { accountId: id, phoneE164: "+213500000000" },
      addresses: [],
      orders: [],
      ratings: [],
    }).profile.accountId,
  ).toBe(id);
});
