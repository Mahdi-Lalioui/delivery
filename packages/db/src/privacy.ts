import type { customerPrivacyExportOutput } from "@zaafran/contracts/retention";
import type { ISql } from "postgres";
import { listAddresses } from "./addresses.js";
import type { DatabaseConnection } from "./database.js";
import { readCustomerOrderReceipts } from "./order-receipts.js";
import { readPrivacyPhone, type PrivacyScope } from "./privacy-account.js";
import { deliverDeletionChallenge, issueDeletionChallenge } from "./privacy-challenge.js";
import { deleteAccount, replayDeletion } from "./privacy-deletion.js";
import {
  findErasureMedia,
  finishErasureMedia,
  recordApplicationMediaArtifact,
} from "./privacy-media.js";
import { pruneDeletionState } from "./privacy-retention.js";

type PrivacyExport = ReturnType<typeof customerPrivacyExportOutput.parse>;

async function exportAccount(sql: ISql, scope: PrivacyScope): Promise<PrivacyExport | undefined> {
  const phoneE164 = await readPrivacyPhone(sql, scope);
  if (!phoneE164) return undefined;
  const addresses = await listAddresses(sql, scope.userId);
  return {
    profile: { accountId: scope.userId, phoneE164 },
    addresses: addresses.map((address) => ({
      ...address,
      landmark: address.landmark ?? null,
      instructions: address.instructions ?? null,
    })),
    orders: await readCustomerOrderReceipts(sql, scope.userId),
    ratings: [],
  };
}

export function createPrivacyRepository({ sql }: DatabaseConnection) {
  return {
    async issueDeletionChallenge(input: Parameters<typeof issueDeletionChallenge>[1]) {
      await pruneDeletionState(sql, input.now);
      return sql.begin((tx) => issueDeletionChallenge(tx, input));
    },
    deliverDeletionChallenge: (input: Parameters<typeof deliverDeletionChallenge>[1]) =>
      sql.begin((tx) => deliverDeletionChallenge(tx, input)),
    deleteAccount: (input: Parameters<typeof deleteAccount>[1]) =>
      sql.begin((tx) => deleteAccount(tx, input)),
    replayDeletion: replayDeletion.bind(undefined, sql),
    exportAccount: (scope: PrivacyScope) =>
      sql.begin("isolation level repeatable read read only", (tx) => exportAccount(tx, scope)),
    findErasureMedia: findErasureMedia.bind(undefined, sql),
    finishErasureMedia: finishErasureMedia.bind(undefined, sql),
    pruneDeletionState: pruneDeletionState.bind(undefined, sql),
    recordApplicationMediaArtifact: recordApplicationMediaArtifact.bind(undefined, sql),
  };
}
