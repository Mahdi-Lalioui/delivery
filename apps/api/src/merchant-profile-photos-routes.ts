import { sessionBoundCommandHeaders } from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  merchantProfilePhotosInput,
  merchantProfilePhotosOutput,
} from "@zaafran/contracts/merchant";
import type { createMerchantProfilePhotosRepository } from "@zaafran/db/merchant-profile-photos";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commandIdentity, resolveSessionCommand } from "./command-identity.js";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

export interface MerchantProfilePhotosServices {
  readonly repository: ReturnType<typeof createMerchantProfilePhotosRepository>;
  readonly now: () => Date;
}

const path = "/v1/merchants/:merchantId/profile/photos";
const config = {
  policy: { kind: "roles", roles: ["customer", "merchant_owner", "merchant_manager"] },
} as const;
const params = z.strictObject({ merchantId: z.uuid() });
const response = {
  200: merchantProfilePhotosOutput,
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  409: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};

export function registerMerchantProfilePhotosRoutes(
  api: FastifyInstance,
  services: MerchantProfilePhotosServices | undefined,
) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  routes.get(path, { config, schema: { params, response } }, async (request, reply) => {
    const actor = getRequestActor(request);
    if (!actor) return sendProblem(reply, 401);
    if (!services) return sendProblem(reply, 503);
    reply.header("cache-control", "no-store");
    const profile = await services.repository.read({
      accountId: actor.accountId,
      merchantId: request.params.merchantId.toLowerCase(),
    });
    return profile
      ? reply.send({ ...profile, sessionId: actor.sessionId })
      : sendProblem(reply, 404, "not_found");
  });

  routes.put(
    path,
    {
      config,
      schema: {
        params,
        headers: sessionBoundCommandHeaders,
        body: merchantProfilePhotosInput,
        response,
      },
    },
    async (request, reply) => {
      const context = resolveSessionCommand({
        request,
        reply,
        services,
        expectedSessionId: request.headers["x-expected-session-id"],
      });
      if (!context) return reply;
      reply.header("cache-control", "no-store");
      const { accountId, sessionId, repository, now } = context;
      const { coverPhotoId, logoPhotoId, expectedRevision } = request.body;
      const input = {
        coverPhotoId: coverPhotoId?.toLowerCase() ?? null,
        logoPhotoId: logoPhotoId?.toLowerCase() ?? null,
        expectedRevision,
      };
      const result = await repository.write({
        accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        input,
        now,
        ...commandIdentity(request.headers["idempotency-key"], input),
      });
      if (!("revision" in result))
        return sendProblem(reply, result.kind === "not_found" ? 404 : 409, result.kind);
      return reply.send({
        sessionId,
        revision: result.revision,
        restaurantName: result.restaurantName,
        coverPhotoId: result.coverPhotoId,
        logoPhotoId: result.logoPhotoId,
      });
    },
  );
}
