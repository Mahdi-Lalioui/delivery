import { sessionBoundCommandHeaders } from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  merchantDeliverySettingsInput,
  merchantDeliverySettingsOutput,
  merchantDeliverySettingsWriteOutput,
} from "@zaafran/contracts/merchant-delivery";
import type { createMerchantDeliveryRepository } from "@zaafran/db/merchant-delivery";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commandIdentity, resolveSessionCommand } from "./command-identity.js";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

export interface MerchantDeliveryServices {
  readonly repository: ReturnType<typeof createMerchantDeliveryRepository>;
  readonly now: () => Date;
}

const path = "/v1/merchants/:merchantId/delivery-settings";
const config = {
  policy: { kind: "roles", roles: ["customer", "merchant_owner", "merchant_manager"] },
} as const;
const params = z.strictObject({ merchantId: z.uuid() });
const errors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  409: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};

function registerRead(api: FastifyInstance, services: MerchantDeliveryServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().get(
    path,
    {
      config,
      schema: { params, response: { 200: merchantDeliverySettingsOutput, ...errors } },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const result = await services.repository.read({
        accountId: actor.accountId,
        merchantId: request.params.merchantId.toLowerCase(),
      });
      return result
        ? reply.send({ ...result, sessionId: actor.sessionId })
        : sendProblem(reply, 404);
    },
  );
}

function registerReplace(api: FastifyInstance, services: MerchantDeliveryServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().put(
    path,
    {
      config,
      schema: {
        params,
        headers: sessionBoundCommandHeaders,
        body: merchantDeliverySettingsInput,
        response: { 200: merchantDeliverySettingsWriteOutput, ...errors },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const context = resolveSessionCommand({
        request,
        reply,
        services,
        expectedSessionId: request.headers["x-expected-session-id"],
      });
      if (!context) return reply;
      const input = request.body;
      const { accountId, now, repository } = context;
      const result = await repository.replace({
        accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        input,
        now,
        ...commandIdentity(request.headers["idempotency-key"], input),
      });
      if (!("revision" in result))
        return sendProblem(reply, result.kind === "not_found" ? 404 : 409, result.kind);
      return reply.send({ revision: result.revision });
    },
  );
}

export function registerMerchantDeliveryRoutes(
  api: FastifyInstance,
  services?: MerchantDeliveryServices,
) {
  registerRead(api, services);
  registerReplace(api, services);
}
