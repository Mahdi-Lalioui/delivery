import { adminFlagOutput, type adminAuditQuery } from "@zaafran/contracts/admin-ops";
import type { DatabaseConnection } from "../database.js";
import { lockMerchantAdmin } from "../merchant-access.js";
import { readAudit } from "./audit.js";
import { runPlatformCommand } from "./commands.js";
import { applyFlag, canonicalFlagKey, readPublicFlags, type FlagWrite } from "./flags.js";
import {
  applySetting,
  readPlatformSettings,
  settingsResult,
  type SettingWrite,
} from "./settings.js";

type AdminAudit = ReturnType<typeof adminAuditQuery.parse> & { readonly adminUserId: string };

export function createPlatformRepository({ sql }: DatabaseConnection) {
  return {
    readPublicFlags: () =>
      sql.begin("isolation level repeatable read read only", (tx) => readPublicFlags(tx)),
    readAdminSettings: (adminUserId: string) =>
      sql.begin(async (tx) =>
        (await lockMerchantAdmin(tx, adminUserId)) ? readPlatformSettings(tx) : undefined,
      ),
    updateSetting: (request: SettingWrite) =>
      sql.begin((tx) =>
        runPlatformCommand(tx, request, {
          entity: "setting",
          parseResult: (result) => settingsResult.parse(result),
          apply: () => applySetting(tx, request),
        }),
      ),
    updateFlag: (request: FlagWrite) =>
      sql.begin((tx) => {
        const normalized = { ...request, key: canonicalFlagKey(request.key) };
        return runPlatformCommand(tx, normalized, {
          entity: "flag",
          parseResult: (result) => adminFlagOutput.parse(result),
          apply: () => applyFlag(tx, normalized),
        });
      }),
    listAudit: ({ adminUserId, ...filter }: AdminAudit) =>
      sql.begin(async (tx) =>
        (await lockMerchantAdmin(tx, adminUserId)) ? readAudit(tx, filter) : undefined,
      ),
  };
}
