import { problemResponseSchema } from "@zaafran/contracts/health";
import { menuPreviewOutput } from "@zaafran/contracts/menu-preview";
import type { createMenuPreviewRepository } from "@zaafran/db/menu-preview";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type Repository = ReturnType<typeof createMenuPreviewRepository>;
export interface MenuPreviewServices {
  readonly repository: Pick<Repository, "read">;
  readonly now: () => Date;
}

// Owners and managers preview what customers will see; the query enforces membership (§17.3).
const config = {
  policy: { kind: "roles", roles: ["customer", "merchant_owner", "merchant_manager"] },
} as const;
const errors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};

export function registerMenuPreviewRoute(
  api: FastifyInstance,
  services: MenuPreviewServices | undefined,
) {
  api.withTypeProvider<ZodTypeProvider>().get(
    "/v1/merchants/:merchantId/menu/preview",
    {
      config,
      schema: {
        params: z.strictObject({ merchantId: z.uuid() }),
        response: { 200: menuPreviewOutput, ...errors },
      },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      reply.header("cache-control", "no-store");
      const result = await services.repository.read({
        accountId: actor.accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        now: services.now(),
      });
      if (result.kind === "not_found") return sendProblem(reply, 404, "not_found");
      const { revision, restaurantName, categories } = result;
      return reply.send({ revision, restaurantName, categories });
    },
  );
}
