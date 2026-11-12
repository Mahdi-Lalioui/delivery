import { createAdminOrdersRepository } from "@zaafran/db/admin-orders";
import { createCourierRepository } from "@zaafran/db/couriers";
import { createOrderRepository } from "@zaafran/db/orders";
import { createOrderQuoteRepository } from "@zaafran/db/order-quotes";
import { createAddressRepository } from "@zaafran/db/addresses";
import { createPushSubscriptionRepository } from "@zaafran/db/push-subscriptions";
import { createPrivacyRepository } from "@zaafran/db/privacy";
import { createAuthRepository } from "@zaafran/db/auth";
import { createBillingRepository, createBillingWriteRepository } from "@zaafran/db/billing";
import { readCommuneCoordinates, readWilayas } from "@zaafran/db/geography";
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
import { createMerchantDeliveryRepository } from "@zaafran/db/merchant-delivery";
import { createMerchantHoursRepository } from "@zaafran/db/merchant-hours";
import { createMenuModerationRepository } from "@zaafran/db/menu-moderation";
import { createMerchantPromotionsRepository } from "@zaafran/db/promotions";
import { createMerchantProfilePhotosRepository } from "@zaafran/db/merchant-profile-photos";
import { createMerchantRepository } from "@zaafran/db/merchant";
import { createMerchantStaffRepository } from "@zaafran/db/merchant-staff";
import { createServiceAreaRepository } from "@zaafran/db/service-area";
import { createPublicFeedRepository } from "@zaafran/db/public-feed";
import { createPublicRestaurantRepository } from "@zaafran/db/public-restaurant";
import { createRoadRouter } from "@zaafran/geo/road-routing";
import { createLocalMediaStore } from "@zaafran/media";
import type { FastifyInstance, FastifyListenOptions } from "fastify";
import { createApi } from "./app.js";
import { createOrderRealtimeSignals } from "./order-realtime-signals.js";
import { createPrivacyService } from "./privacy-service.js";
import { createStaffInvitationToken } from "./auth-crypto.js";
import { createAuthSmsAdapter, createSmsMessages } from "./auth-sms-adapter.js";
import { createResendSender, createTwilioSender } from "@zaafran/notifications";
import { invitationCopy, otpCopy, type InvitationKind } from "./message-copy.js";
import { createAuthService } from "./auth-service.js";
import type { CourierServices } from "./courier-routes.js";
import type { InvitationMessage, MerchantStaffServices } from "./merchant-staff-routes.js";
import { readApiEnvironment } from "./environment.js";
import { createRoutedTracking } from "./routed-tracking.js";
import { checkReadiness } from "./readiness.js";

export interface StartOptions {
  readonly now?: () => Date;
  readonly sendEmail?: NonNullable<Parameters<typeof createAuthService>[0]["sendEmail"]>;
  readonly sendSms?: Parameters<typeof createAuthService>[0]["sendSms"];
  readonly sendInvitation?: MerchantStaffServices["sendInvitation"];
  readonly sendCourierInvitation?: MerchantStaffServices["sendInvitation"];
  readonly sendEmailInvitation?: (
    message: InvitationMessage & { email: string; kind: InvitationKind },
  ) => Promise<void> | void;
  readonly configure?: (api: FastifyInstance) => void;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly listen?: (api: FastifyInstance, options: FastifyListenOptions) => Promise<string>;
}

export async function startApi(options: StartOptions = {}): Promise<FastifyInstance> {
  const environment = readApiEnvironment(options.environment ?? process.env);
  const database = openDatabase(environment.DATABASE_URL);
  const now = options.now ?? (() => new Date());
  const otpKey = Buffer.from(environment.AUTH_OTP_KEY, "hex");
  const { sendSms, sendInvitation, sendCourierInvitation, smsEnabled } = smsServices(
    environment,
    options,
  );
  const { sendEmail, sendEmailInvitation } = emailServices(environment, options);
  const service = createAuthService({
    repository: createAuthRepository(database),
    otpKey,
    totpKey: Buffer.from(environment.AUTH_TOTP_KEY, "hex"),
    now,
    sendSms,
    smsEnabled,
    sendEmail,
  });
  const merchantHours = createMerchantHoursRepository(database);
  const platform = createPlatformRepository(database);
  const publicRestaurant = createPublicRestaurantRepository(database);
  const mediaStore = createLocalMediaStore({ root: environment.MEDIA_STORAGE_ROOT });
  const orders = createOrderRepository(database, otpKey);
  const api = createApi({
    checkReadiness: () => checkReadiness(database),
    trustedProxy: environment.API_TRUSTED_PROXY,
    auth: { service, publicOrigin: environment.AUTH_PUBLIC_ORIGIN },
    addresses: createAddressRepository(database),
    orders: { repository: orders, now },
    orderHistory: orders,
    orderHistoryClock: now,
    reviews: orders,
    reviewCommands: { repository: orders, now },
    analytics: { repository: orders, now },
    favourites: { repository: orders, now },
    orderRatings: { repository: orders, now },
    orderActions: { repository: orders, now },
    adminOrders: createAdminOrdersRepository(database),
    couriers: {
      repository: createCourierRepository(database),
      now,
      sendInvitation: courierDelivery(sendCourierInvitation, sendEmailInvitation),
    },
    merchantBoard: orders,
    orderTracking: createRoutedTracking({
      read: orders.tracking,
      route: createRoadRouter({ origin: environment.OSRM_INTERNAL_ORIGIN }),
      now: () => now().getTime(),
    }),
    pushSubscriptions: createPushSubscriptionRepository(database),
    pushPublicKey: environment.VAPID_PUBLIC_KEY,
    realtime: {
      replay: orders.merchantReplay,
      replayOrder: orders.orderReplay,
      ...createOrderRealtimeSignals(database.sql),
    },
    orderQuotes: { repository: createOrderQuoteRepository(database), now },
    privacy: createPrivacyService({
      repository: createPrivacyRepository(database),
      otpKey,
      now,
      sendSms,
      smsEnabled,
      sendEmail,
    }),
    merchant: { repository: createMerchantRepository(database), now },
    merchantDelivery: { repository: createMerchantDeliveryRepository(database), now },
    billing: createBillingRepository(database),
    billingWrites: { repository: createBillingWriteRepository(database), now },
    platform: { repository: platform, now },
    discovery: createServiceAreaRepository(database),
    wilayas: () => readWilayas(database),
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
      createToken: (scope) => createStaffInvitationToken({ ...scope, key: otpKey }),
      sendInvitation,
      sendEmailInvitation:
        sendEmailInvitation && ((message) => sendEmailInvitation({ ...message, kind: "staff" })),
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

function configureSms(environment: ReturnType<typeof readApiEnvironment>) {
  const {
    AUTH_SMS_WEBHOOK_URL: url,
    AUTH_SMS_WEBHOOK_TOKEN: token,
    AUTH_PUBLIC_ORIGIN: publicOrigin,
    AUTH_TWILIO_ACCOUNT_SID: accountSid,
    AUTH_TWILIO_AUTH_TOKEN: authToken,
    AUTH_TWILIO_FROM: from,
  } = environment;
  if (accountSid && authToken && from) {
    return createSmsMessages(createTwilioSender({ accountSid, authToken, from }), publicOrigin);
  }
  return url && token ? createAuthSmsAdapter({ url, token, publicOrigin }) : undefined;
}

function smsServices(environment: ReturnType<typeof readApiEnvironment>, options: StartOptions) {
  const configured = configureSms(environment);
  return {
    smsEnabled: Boolean(options.sendSms ?? configured),
    sendSms: options.sendSms ?? configured?.sendOtp ?? unavailableSms,
    sendInvitation: options.sendInvitation ?? configured?.sendInvitation ?? unavailableSms,
    sendCourierInvitation: options.sendCourierInvitation ?? configured?.sendCourierInvitation,
  };
}

function configureEmail({
  AUTH_RESEND_API_KEY: apiKey,
  AUTH_RESEND_FROM: from,
}: ReturnType<typeof readApiEnvironment>) {
  return apiKey && from ? createResendSender({ apiKey, from: `AWID <${from}>` }) : undefined;
}

function emailServices(environment: ReturnType<typeof readApiEnvironment>, options: StartOptions) {
  const send = configureEmail(environment);
  const sendOtp: StartOptions["sendEmail"] =
    send &&
    (({ email, code, deliveryKey, locale }) =>
      send({ ...otpCopy(locale, code), to: email, key: `otp:${deliveryKey}` }));
  const sendInvite: StartOptions["sendEmailInvitation"] =
    send &&
    (({ email, token, deliveryKey, locale, kind }) =>
      send({
        ...invitationCopy({ publicOrigin: environment.AUTH_PUBLIC_ORIGIN, token, locale, kind }),
        to: email,
        key: `${kind}-invite:${deliveryKey}`,
      }));
  return {
    sendEmail: options.sendEmail ?? sendOtp,
    sendEmailInvitation: options.sendEmailInvitation ?? sendInvite,
  };
}

function courierDelivery(
  sendSms: MerchantStaffServices["sendInvitation"] | undefined,
  sendEmail: StartOptions["sendEmailInvitation"],
): NonNullable<CourierServices["sendInvitation"]> {
  return (message) => {
    if (message.email === undefined) {
      if (!sendSms) return unavailableSms();
      return sendSms(message);
    }
    if (!sendEmail) throw new Error("Email delivery is unavailable.");
    return sendEmail({ ...message, kind: "courier" });
  };
}

function unavailableSms(): never {
  throw new Error("SMS delivery is unavailable.");
}
