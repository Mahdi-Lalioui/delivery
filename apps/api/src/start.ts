import { randomBytes } from "node:crypto";
import { createAuthRepository } from "@zaafran/db/auth";
import { openDatabase } from "@zaafran/db/database";
import { createMediaRepository } from "@zaafran/db/media";
import { createMenuCategoryRepository } from "@zaafran/db/menu-category";
import { createMenuImportRepository } from "@zaafran/db/menu-import";
import { createMenuItemRepository } from "@zaafran/db/menu-item";
import { createMenuOptionGroupRepository } from "@zaafran/db/menu-option-group";
import { createMenuPreviewRepository } from "@zaafran/db/menu-preview";
import { createMenuPriceRepository } from "@zaafran/db/menu-price";
import { createMerchantHoursRepository } from "@zaafran/db/merchant-hours";
import { createMenuModerationRepository } from "@zaafran/db/menu-moderation";
import { createMerchantRepository } from "@zaafran/db/merchant";
import { createMerchantStaffRepository } from "@zaafran/db/merchant-staff";
import { createLocalMediaStore } from "@zaafran/media";
import type { FastifyInstance, FastifyListenOptions } from "fastify";
import { createApi } from "./app.js";
import { createAuthService } from "./auth-service.js";
import type { MerchantStaffServices } from "./merchant-staff-routes.js";
import { readApiEnvironment } from "./environment.js";
import { checkReadiness } from "./readiness.js";

export interface StartOptions {
  readonly now?: () => Date;
  readonly sendSms?: Parameters<typeof createAuthService>[0]["sendSms"];
  readonly sendInvitation?: MerchantStaffServices["sendInvitation"];
  readonly configure?: (api: FastifyInstance) => void;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly listen?: (api: FastifyInstance, options: FastifyListenOptions) => Promise<string>;
}

export async function startApi(options: StartOptions = {}): Promise<FastifyInstance> {
  const environment = readApiEnvironment(options.environment ?? process.env);
  const database = openDatabase(environment.DATABASE_URL);
  const now = options.now ?? (() => new Date());
  const service = createAuthService({
    repository: createAuthRepository(database),
    otpKey: Buffer.from(environment.AUTH_OTP_KEY, "hex"),
    totpKey: Buffer.from(environment.AUTH_TOTP_KEY, "hex"),
    now,
    sendSms: options.sendSms ?? unavailableSms,
  });
  const merchantHours = createMerchantHoursRepository(database);
  const api = createApi({
    checkReadiness: () => checkReadiness(database),
    trustedProxy: environment.API_TRUSTED_PROXY,
    auth: { service, publicOrigin: environment.AUTH_PUBLIC_ORIGIN },
    merchant: { repository: createMerchantRepository(database), now },
    menuModeration: { repository: createMenuModerationRepository(database), now },
    media: {
      repository: createMediaRepository(database),
      store: createLocalMediaStore({ root: environment.MEDIA_STORAGE_ROOT }),
      now,
    },
    menuCategory: { repository: createMenuCategoryRepository(database), now },
    menuItem: { repository: createMenuItemRepository(database), now },
    menuImport: {
      repository: createMenuImportRepository(database),
      now,
      previewKey: Buffer.from(environment.AUTH_OTP_KEY, "hex"),
    },
    menuOptionGroup: { repository: createMenuOptionGroupRepository(database), now },
    menuPreview: { repository: createMenuPreviewRepository(database), now },
    menuPrice: { repository: createMenuPriceRepository(database), now },
    merchantHours: { repository: merchantHours, now },
    merchantHoursPreview: { repository: merchantHours, now },
    merchantStaff: {
      repository: createMerchantStaffRepository(database),
      now,
      createToken: () => randomBytes(32).toString("base64url"),
      sendInvitation: options.sendInvitation ?? unavailableSms,
    },
  });
  api.addHook("onClose", () => database.close());
  try {
    options.configure?.(api);
    const listener = { host: environment.API_HOST, port: environment.API_PORT };
    const listenAddress = await (options.listen
      ? options.listen(api, listener)
      : api.listen(listener));
    api.log.info({ listenAddress }, "API listening");
    return api;
  } catch (error) {
    await api.close();
    throw error;
  }
}

function unavailableSms(): never {
  throw new Error("SMS delivery is unavailable.");
}
