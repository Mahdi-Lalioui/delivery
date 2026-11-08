import { randomUUID } from "node:crypto";
import type { Writable } from "node:stream";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import { requestIdSchema } from "@zaafran/contracts/health";
import fastify, { LogController, type FastifyInstance } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { createAuthAccess } from "./auth-access.js";
import { registerAuthRoutes } from "./auth-routes.js";
import { registerHealth } from "./health.js";
import { registerMerchantRoutes, type MerchantServices } from "./merchant-routes.js";
import {
  registerAdminModerationRoutes,
  type MenuModerationServices,
} from "./admin-moderation-routes.js";
import {
  registerMediaReservationRoutes,
  type MediaReservationServices,
} from "./media-reservation-routes.js";
import { createLogger } from "./logger.js";
import { registerMenuCategoryRoutes, type MenuCategoryServices } from "./menu-category-routes.js";
import { registerMenuImportRoutes, type MenuImportServices } from "./menu-import-routes.js";
import { registerMenuItemRoutes, type MenuItemServices } from "./menu-item-routes.js";
import { registerMenuPreviewRoutes, type MenuPreviewServices } from "./menu-preview-routes.js";
import {
  registerMenuOptionGroupRoutes,
  type MenuOptionGroupServices,
} from "./menu-option-group-routes.js";
import { registerMenuPriceRoutes, type MenuPriceServices } from "./menu-price-routes.js";
import {
  registerMerchantHoursPreviewRoute,
  type MerchantHoursPreviewServices,
} from "./merchant-hours-preview-routes.js";
import {
  registerMerchantHoursRoutes,
  type MerchantHoursServices,
} from "./merchant-hours-routes.js";
import {
  registerMerchantStaffRoutes,
  type MerchantStaffServices,
} from "./merchant-staff-routes.js";
import { enforceRoutePolicies, recordRoutePolicies, type ResolveActor } from "./policy.js";
import { sendProblem } from "./problems.js";

interface ApiOptions {
  readonly checkReadiness: () => Promise<void>;
  readonly merchant?: MerchantServices;
  readonly menuModeration?: MenuModerationServices;
  readonly media?: MediaReservationServices;
  readonly menuCategory?: MenuCategoryServices;
  readonly menuItem?: MenuItemServices;
  readonly menuPreview?: MenuPreviewServices;
  readonly menuImport?: MenuImportServices;
  readonly menuOptionGroup?: MenuOptionGroupServices;
  readonly menuPrice?: MenuPriceServices;
  readonly merchantHours?: MerchantHoursServices;
  readonly merchantHoursPreview?: MerchantHoursPreviewServices;
  readonly merchantStaff?: MerchantStaffServices;
  readonly trustedProxy?: string | undefined;
  readonly auth?: Parameters<typeof createAuthAccess>[0];
  readonly resolveActor?: ResolveActor;
  readonly rateLimit?: { readonly max: number; readonly timeWindow: number };
  readonly logStream?: Writable;
}

export function createApi(options: ApiOptions): FastifyInstance {
  const api = fastify({
    trustProxy: options.trustedProxy ?? false,
    bodyLimit: 256 * 1024,
    exposeHeadRoutes: false,
    requestIdHeader: false,
    logController: new LogController({
      requestIdLogLabel: "requestId",
      disableRequestLogging: true,
    }),
    loggerInstance: createLogger(options.logStream),
    genReqId(request) {
      const result = requestIdSchema.safeParse(request.headers["x-request-id"]);
      return result.success ? result.data : randomUUID();
    },
  });
  api.setValidatorCompiler(validatorCompiler);
  api.setSerializerCompiler(serializerCompiler);
  api.addHook("onRequest", (request, reply, done) => {
    reply.header("x-request-id", request.id);
    done();
  });
  recordRoutePolicies(api);
  api.setNotFoundHandler((_request, reply) => sendProblem(reply, 404));
  api.setErrorHandler((error, request, reply) => {
    const status = readErrorStatus(error);
    if (status >= 500) request.log.error("Unhandled request failure");
    return sendProblem(reply, status);
  });
  void api.register(rateLimit, {
    global: false,
    ...(options.rateLimit ?? { max: 120, timeWindow: 60_000 }),
    errorResponseBuilder: (_request, context) =>
      Object.assign(new Error("Request rate limit reached"), { statusCode: context.statusCode }),
  });
  void api.register(swagger, {
    openapi: { info: { title: "Marketplace API", version: "0.1.0" } },
    transform: jsonSchemaTransform,
  });
  void api.after(() => {
    api.addHook("onRequest", api.rateLimit());
    const access = createAuthAccess(options.auth);
    api.addHook("onRequest", access.guardCookieMutation);
    enforceRoutePolicies(api, options.resolveActor ?? access.resolveActor);
    api.addHook("onSend", (request, reply, payload) => {
      access.refreshCookie(request, reply);
      return Promise.resolve(payload);
    });
    registerAuthRoutes(api, access);
    registerMerchantRoutes(api, options.merchant);
    registerAdminModerationRoutes(api, options.menuModeration);
    registerMediaReservationRoutes(api, options.media);
    registerMenuCategoryRoutes(api, options.menuCategory);
    registerMenuItemRoutes(api, options.menuItem);
    registerMenuPreviewRoutes(api, options.menuPreview);
    registerMenuImportRoutes(api, options.menuImport);
    registerMenuOptionGroupRoutes(api, options.menuOptionGroup);
    registerMenuPriceRoutes(api, options.menuPrice);
    registerMerchantHoursRoutes(api, options.merchantHours);
    registerMerchantHoursPreviewRoute(api, options.merchantHoursPreview);
    registerMerchantStaffRoutes(api, options.merchantStaff);
    registerHealth(api, options.checkReadiness);
  });
  return api;
}

function readErrorStatus(error: unknown): number {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return 500;
  const status = error.statusCode;
  return typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599
    ? status
    : 500;
}
