import type { DatabaseConnection } from "./database.js";

export interface ReviewNoticeRecipient {
  readonly adminUserId: string;
  readonly phone: string;
}

/** Reads who should hear about a new merchant application (D-021). */
export function createReviewNoticeRepository({ sql }: DatabaseConnection) {
  return {
    listRecipients: async (): Promise<ReviewNoticeRecipient[]> => {
      const rows = await sql<ReviewNoticeRecipient[]>`
        SELECT account.id AS "adminUserId", account.phone_e164 AS phone
        FROM public.admins AS admin
        JOIN public.users AS account ON account.id = admin.user_id
        WHERE account.blocked_at IS NULL AND account.deleted_at IS NULL
        ORDER BY account.id
      `;
      return [...rows];
    },
  };
}
