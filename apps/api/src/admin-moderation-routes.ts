import {
  adminItemQueueOutput,
  adminItemQueueQuery,
  adminItemReviewInput,
  adminItemReviewOutput,
} from "@zaafran/contracts/admin-moderation";
import { sessionBoundCommandHeaders } from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import type { createMenuModerationRepository } from "@zaafran/db/menu-moderation";
import { findProhibitedGoods } from "@zaafran/domain/moderation";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commandIdentity } from "./command-identity.js";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

export interface MenuModerationServices {
  readonly repository: ReturnType<typeof createMenuModerationRepository>;
  readonly now: () => Date;
}

type Translations = { readonly ar?: string; readonly fr?: string; readonly en?: string };

const adminConfig = { policy: { kind: "roles", roles: ["admin"] } } as const;
const itemIdParams = z.strictObject({ itemId: z.uuid() });
const errors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  409: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};
const failureStatus = {
  forbidden: 403,
  not_found: 404,
  invalid_status: 409,
  idempotency_conflict: 409,
};

function textsOf(...translations: Translations[]): string[] {
  return translations.flatMap(({ ar, fr, en }) => [ar ?? "", fr ?? "", en ?? ""]);
}

function registerHeldQueue(api: FastifyInstance, services: MenuModerationServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().get(
    "/v1/admin/menu-items/held",
    {
      config: adminConfig,
      schema: {
        querystring: adminItemQueueQuery,
        response: { 200: adminItemQueueOutput, ...errors },
      },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      reply.header("cache-control", "no-store");
      const { cursor, limit } = request.query;
      const page = await services.repository.listHeldItems({
        adminUserId: actor.accountId,
        limit,
        ...(cursor === undefined ? {} : { cursor: cursor.toLowerCase() }),
      });
      if (!page) return sendProblem(reply, 403, "forbidden");
      const items = page.items.map((item) => ({
        ...item,
        matches: findProhibitedGoods(textsOf(item.names, item.descriptions)),
      }));
      return reply.send({ sessionId: actor.sessionId, items, nextCursor: page.nextCursor });
    },
  );
}

function registerItemReview(api: FastifyInstance, services: MenuModerationServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().post(
    "/v1/admin/menu-items/:itemId/review",
    {
      config: adminConfig,
      schema: {
        headers: sessionBoundCommandHeaders,
        params: itemIdParams,
        body: adminItemReviewInput,
        response: { 200: adminItemReviewOutput, ...errors },
      },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      if (request.headers["x-expected-session-id"].toLowerCase() !== actor.sessionId)
        return sendProblem(reply, 409, "session_changed");
      const body = { itemId: request.params.itemId.toLowerCase(), ...request.body };
      const result = await services.repository.reviewItem({
        ...body,
        adminUserId: actor.accountId,
        now: services.now(),
        ...commandIdentity(request.headers["idempotency-key"], body),
      });
      if (!("itemId" in result)) return sendProblem(reply, failureStatus[result.kind], result.kind);
      return reply.send({
        itemId: result.itemId,
        merchantId: result.merchantId,
        moderationStatus: result.status,
        reviewedAt: result.reviewedAt.toISOString(),
      });
    },
  );
}

/** ADM-04 routes for items held by the prohibited-goods screen (SPEC §17.3, D-014). */
export function registerAdminModerationRoutes(
  api: FastifyInstance,
  services: MenuModerationServices | undefined,
): void {
  registerHeldQueue(api, services);
  registerItemReview(api, services);
}
