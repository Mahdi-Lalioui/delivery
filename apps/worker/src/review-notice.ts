import type { DatabaseConnection } from "@zaafran/db/database";
import { createReviewNoticeRepository } from "@zaafran/db/merchant-review-notice";
import { runJobEffectOnce } from "./effects.js";
import type { SmsSender } from "./sms.js";

export const reviewNoticeIdentifier = "merchant.review_notice";

// D-021: French until accounts store a locale (NOT-02); no applicant data in the text.
const reviewNoticePath = "/fr/admin/merchant-applications";
const reviewNoticeText = `Nouvelle demande de restaurant à examiner : ${reviewNoticePath}`;

interface ReviewNoticeOptions {
  readonly database: DatabaseConnection;
  readonly sms: SmsSender;
}

/** Sends each active admin one SMS per application, at least once (NOT-01). */
export function createReviewNotifier({ database, sms }: ReviewNoticeOptions) {
  const repository = createReviewNoticeRepository(database);
  return async ({ merchantId }: { merchantId: string }): Promise<void> => {
    for (const { adminUserId, phone } of await repository.listRecipients()) {
      await runJobEffectOnce({
        database,
        taskIdentifier: reviewNoticeIdentifier,
        effectKey: `${merchantId}:${adminUserId}:sms`,
        apply: () => sms.send({ phone, text: reviewNoticeText }),
      });
    }
  };
}
