import { randomBytes } from "node:crypto";
import { createOrderRepository } from "@zaafran/db/orders";
import { createOrderQuoteRepository } from "@zaafran/db/order-quotes";
import { createAddressRepository } from "@zaafran/db/addresses";
import { createPrivacyRepository } from "@zaafran/db/privacy";
import { createAuthRepository } from "@zaafran/db/auth";
import { createBillingRepository, createBillingWriteRepository } from "@zaafran/db/billing";
import { readCommuneCoordinates } from "@zaafran/db/geography";
import { createPlatformRepository } from "@zaafran/db/platform";
import { openDatabase } from "@zaafran/db/database";
import { createDiscoverySearchRepository } from "@zaafran/db/discovery-search";
import { createMediaRepository } from "@zaafran/db/media";
import { createMenuCategoryRepository } from "@zaafran/db/menu-category";
import { createMenuImportRepository } from "@zaafran/db/menu-import";
import { createMenuItemRepository } from "@zaafran/db/menu-item";
import { createMenuPreviewRepository } from "@zaafran/db/menu-preview";
import { createMenuOptionGroupRepository } from "@zaafran/db/menu-option-group";
import { createMenuPriceRepository } from "@zaafran/db/menu-price";
import { createMerchantHoursRepository } from "@zaafran/db/merchant-hours";
import { createMenuModerationRepository } from "@zaafran/db/menu-moderation";
import { createMerchantPromotionsRepository } from "@zaafran/db/promotions";
import { createMerchantProfilePhotosRepository } from "@zaafran/db/merchant-profile-photos";
import { createMerchantRepository } from "@zaafran/db/merchant";
import { createMerchantStaffRepository } from "@zaafran/db/merchant-staff";
import { createServiceAreaRepository } from "@zaafran/db/service-area";
import { createPublicFeedRepository } from "@zaafran/db/public-feed";
import { createPublicRestaurantRepository } from "@zaafran/db/public-restaurant";
import { createLocalMediaStore } from "@zaafran/media";
import type { FastifyInstance, FastifyListenOptions } from "fastify";
import { createApi } from "./app.js";
import { createPrivacyService } from "./privacy-service.js";
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
  const otpKey = Buffer.from(environment.AUTH_OTP_KEY, "hex");
  const sendSms = options.sendSms ?? unavailableSms;
  const service = createAuthService({
    repository: createAuthRepository(database),
    otpKey,
    totpKey: Buffer.from(environment.AUTH_TOTP_KEY, "hex"),
    now,
    sendSms,
  });
  const merchantHours = createMerchantHoursRepository(database);
  const platform = createPlatformRepository(database);
  const publicRestaurant = createPublicRestaurantRepository(database);
  const mediaStore = createLocalMediaStore({ root: environment.MEDIA_STORAGE_ROOT });
  const orders = createOrderRepository(database);
  const api = createApi({
    checkReadiness: () => checkReadiness(database),
    trustedProxy: environment.API_TRUSTED_PROXY,
    auth: { service, publicOrigin: environment.AUTH_PUBLIC_ORIGIN },
    addresses: createAddressRepository(database),
    orders: { repository: orders, now },
    orderActions: { repository: orders, now },
    orderQuotes: { repository: createOrderQuoteRepository(database), now },
    privacy: createPrivacyService({
      repository: createPrivacyRepository(database),
      otpKey,
      now,
      sendSms,
    }),
    merchant: { repository: createMerchantRepository(database), now },
    billing: createBillingRepository(database),
    billingWrites: { repository: createBillingWriteRepository(database), now },
    platform: { repository: platform, now },
    discovery: createServiceAreaRepository(database),
    discoverySearch: createDiscoverySearchRepository(database),
    publicFeed: { repository: createPublicFeedRepository(database), store: mediaStore, now },
    publicRestaurant: { repository: publicRestaurant, now },
    publicRestaurantPhotos: { readPhoto: publicRestaurant.readPhoto, store: mediaStore },
    ramadan: {
      isRamadanEnabled: async () => (await platform.readPublicFlags()).flags.ramadan_mode === true,
      findCoordinates: (communeId) => readCommuneCoordinates(database, communeId),
      now,
    },
    merchantProfilePhotos: { repository: createMerchantProfilePhotosRepository(database), now },
    merchantPromotions: { repository: createMerchantPromotionsRepository(database), now },
    menuModeration: { repository: createMenuModerationRepository(database), now },
    media: {
      repository: createMediaRepository(database),
      store: mediaStore,
      now,
    },
    menuCategory: { repository: createMenuCategoryRepository(database), now },
    menuItem: { repository: createMenuItemRepository(database), now },
    menuPreview: { repository: createMenuPreviewRepository(database), now },
    menuImport: {
      repository: createMenuImportRepository(database),
      now,
      previewKey: Buffer.from(environment.AUTH_OTP_KEY, "hex"),
    },
    menuOptionGroup: { repository: createMenuOptionGroupRepository(database), now },
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
