import { createHmac, randomUUIDv7 } from "node:crypto";
import type { createPrivacyRepository } from "@zaafran/db/privacy";
import { readRequestCredential } from "./auth-access.js";
import { createOtpCode, hashOtp, hashSessionToken } from "./auth-crypto.js";
import type { createAuthService } from "./auth-service.js";
import type { PrivacyServices } from "./privacy-routes.js";

type Options = {
  repository: Pick<
    ReturnType<typeof createPrivacyRepository>,
    | "issueDeletionChallenge"
    | "deliverDeletionChallenge"
    | "deleteAccount"
    | "replayDeletion"
    | "exportAccount"
  >;
  otpKey: Uint8Array;
  now: () => Date;
  sendSms: Parameters<typeof createAuthService>[0]["sendSms"];
  smsEnabled?: boolean;
  sendEmail?: Parameters<typeof createAuthService>[0]["sendEmail"];
};

export function createPrivacyService({
  repository,
  otpKey,
  now,
  sendSms,
  smsEnabled = true,
  sendEmail,
}: Options): PrivacyServices {
  const key = createHmac("sha256", otpKey).update("account-delete").digest();
  function digest(purpose: string, value: string) {
    return createHmac("sha256", key).update(purpose).update("\0").update(value).digest();
  }
  function codeHash(challengeId: string, code: string) {
    return hashOtp({ key, challengeId, code });
  }
  return {
    async issue({ idempotencyKey, locale, ...identity }) {
      const challengeId = randomUUIDv7();
      const code = createOtpCode({ key, challengeId });
      const result = await repository.issueDeletionChallenge({
        ...identity,
        challengeId,
        keyHash: digest("idempotency", idempotencyKey),
        hashRequestIp: (ip) => digest("ip", ip),
        codeHmac: codeHash(challengeId, code),
        now: now(),
      });
      if (result.kind !== "issued") return result;
      if (result.needsDelivery) {
        const issuedCode = createOtpCode({ key, challengeId: result.challengeId });
        try {
          const delivered = await repository.deliverDeletionChallenge({
            userId: identity.userId,
            sessionId: identity.sessionId,
            challengeId: result.challengeId,
            now: now(),
            preferEmail: !smsEnabled && sendEmail !== undefined,
            send(target) {
              const message = {
                code: issuedCode,
                ...(locale === undefined ? {} : { locale }),
                deliveryKey: "account-delete:" + result.challengeId,
              };
              if (target.email === undefined)
                return sendSms({ ...message, phone: target.phoneE164 });
              if (!sendEmail) throw new Error("Email delivery is unavailable.");
              return sendEmail({ ...message, email: target.email });
            },
          });
          if (!delivered) return { kind: "unauthorized" };
        } catch {
          return { kind: "delivery_unavailable" };
        }
      }
      return { kind: "issued", challengeId: result.challengeId, expiresAt: result.expiresAt };
    },
    confirm({ challengeId, code, ...identity }) {
      const id = challengeId.toLowerCase();
      return repository.deleteAccount({
        ...identity,
        challengeId: id,
        codeHmac: codeHash(id, code),
        now: now(),
      });
    },
    replay(request, { challengeId, code }) {
      const credential = readRequestCredential(request);
      const tokenHash = credential && hashSessionToken(credential.token);
      if (!credential || !tokenHash) return Promise.resolve(false);
      const id = challengeId.toLowerCase();
      return repository.replayDeletion({
        tokenHash,
        transport: credential.transport,
        challengeId: id,
        codeHmac: codeHash(id, code),
        now: now(),
      });
    },
    exportAccount: (identity) => repository.exportAccount({ ...identity, now: now() }),
  };
}
