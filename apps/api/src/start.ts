import { createAuthRepository } from "@zaafran/db/auth";
import { openDatabase } from "@zaafran/db/database";
import { createMenuCategoryRepository } from "@zaafran/db/menu-category";
import { createMenuItemRepository } from "@zaafran/db/menu-item";
import { createMenuOptionGroupRepository } from "@zaafran/db/menu-option-group";
import { createMerchantRepository } from "@zaafran/db/merchant";
import type { FastifyInstance, FastifyListenOptions } from "fastify";
import { createApi } from "./app.js";
import { createAuthService } from "./auth-service.js";
import { readApiEnvironment } from "./environment.js";
import { checkReadiness } from "./readiness.js";

export interface StartOptions {
  readonly now?: () => Date;
  readonly sendSms?: Parameters<typeof createAuthService>[0]["sendSms"];
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
  const api = createApi({
    checkReadiness: () => checkReadiness(database),
    trustedProxy: environment.API_TRUSTED_PROXY,
    auth: { service, publicOrigin: environment.AUTH_PUBLIC_ORIGIN },
    merchant: { repository: createMerchantRepository(database), now },
    menuCategory: { repository: createMenuCategoryRepository(database), now },
    menuItem: { repository: createMenuItemRepository(database), now },
    menuOptionGroup: { repository: createMenuOptionGroupRepository(database), now },
  });
  api.addHook("onClose", () => database.close());
  try {
    options.configure?.(api);
    const listener = { host: environment.API_HOST, port: environment.API_PORT };
    const address = await (options.listen ? options.listen(api, listener) : api.listen(listener));
    api.log.info({ address }, "API listening");
    return api;
  } catch (error) {
    await api.close();
    throw error;
  }
}

function unavailableSms(): never {
  throw new Error("SMS delivery is unavailable.");
}
