import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  menuItemPageQuery,
  menuPreviewDetailOutput,
  menuPreviewItemQuery,
  menuPreviewPageOutput,
  readMenuItemCursor,
} from "@zaafran/contracts/menu";
import type { createMenuPreviewRepository } from "@zaafran/db/menu-preview";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

export interface MenuPreviewServices {
  readonly repository: ReturnType<typeof createMenuPreviewRepository>;
  readonly now: () => Date;
}

const path = "/v1/merchants/:merchantId/menu/preview/items";
const merchantParams = z.strictObject({ merchantId: z.uuid() });
const itemParams = merchantParams.extend({ itemId: z.uuid() });
const config = {
  policy: { kind: "roles", roles: ["customer", "merchant_owner", "merchant_manager"] },
} as const;
const errors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  409: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};
const failureStatus = { invalid_cursor: 400, not_found: 404, revision_conflict: 409 } as const;

export function registerMenuPreviewRoutes(
  api: FastifyInstance,
  services: MenuPreviewServices | undefined,
) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  routes.get(
    path,
    {
      config,
      schema: {
        params: merchantParams,
        querystring: menuItemPageQuery,
        response: { 200: menuPreviewPageOutput, ...errors },
      },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      reply.header("cache-control", "no-store");
      const { categoryId, limit, cursor } = request.query;
      const parsed = cursor === undefined ? undefined : readMenuItemCursor(cursor);
      const result = await services.repository.list({
        accountId: actor.accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        categoryId: categoryId.toLowerCase(),
        limit,
        now: services.now(),
        ...(parsed === undefined ? {} : { cursor: parsed }),
      });
      if (result.kind !== "listed")
        return sendProblem(reply, failureStatus[result.kind], result.kind);
      const { revision, context, items, nextCursor } = result;
      return reply.send({ sessionId: actor.sessionId, revision, context, items, nextCursor });
    },
  );

  routes.get(
    path + "/:itemId",
    {
      config,
      schema: {
        params: itemParams,
        querystring: menuPreviewItemQuery,
        response: { 200: menuPreviewDetailOutput, ...errors },
      },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      reply.header("cache-control", "no-store");
      const result = await services.repository.detail({
        accountId: actor.accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        itemId: request.params.itemId.toLowerCase(),
        expectedRevision: request.query.expectedRevision,
        now: services.now(),
      });
      if (result.kind !== "found")
        return sendProblem(reply, failureStatus[result.kind], result.kind);
      const { revision, item, optionGroups } = result;
      return reply.send({ sessionId: actor.sessionId, revision, item, optionGroups });
    },
  );
}
