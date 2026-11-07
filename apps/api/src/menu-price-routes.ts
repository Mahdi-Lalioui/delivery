import { sessionBoundCommandHeaders } from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  bulkPriceApplyInput,
  bulkPriceApplyOutput,
  bulkPricePreviewInput,
  bulkPricePreviewOutput,
  bulkPriceUndoInput,
  bulkPriceUndoOutput,
} from "@zaafran/contracts/menu-price";
import type { createMenuPriceRepository } from "@zaafran/db/menu-price";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commandIdentity, resolveSessionCommand } from "./command-identity.js";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type Repository = ReturnType<typeof createMenuPriceRepository>;
export interface MenuPriceServices {
  readonly repository: Repository;
  readonly now: () => Date;
}

const path = "/v1/merchants/:merchantId/menu/prices";
const config = {
  policy: { kind: "roles", roles: ["customer", "merchant_owner", "merchant_manager"] },
} as const;
const merchantParams = z.strictObject({ merchantId: z.uuid() });
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
  not_found: 404,
  invalid_bulk_price_change: 400,
  revision_conflict: 409,
  idempotency_conflict: 409,
  undo_window_expired: 409,
  price_changed_since_apply: 409,
  price_change_already_undone: 409,
};

function priceProblem(reply: FastifyReply, kind: keyof typeof failureStatus): FastifyReply {
  return sendProblem(reply, failureStatus[kind], kind);
}

function canonicalItemIds(itemIds: readonly string[]) {
  return itemIds.map((itemId) => itemId.toLowerCase());
}

function registerPreview(api: FastifyInstance, services: MenuPriceServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().post(
    path + "/preview",
    {
      config,
      schema: {
        params: merchantParams,
        body: bulkPricePreviewInput,
        response: { 200: bulkPricePreviewOutput, ...errors },
      },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      reply.header("cache-control", "no-store");
      const { adjustment, roundingUnit } = request.body;
      const result = await services.repository.preview({
        accountId: actor.accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        itemIds: canonicalItemIds(request.body.itemIds),
        adjustment,
        roundingUnit,
      });
      if (result.kind !== "previewed") return priceProblem(reply, result.kind);
      return reply.send({
        sessionId: actor.sessionId,
        revision: result.revision,
        items: [...result.items],
      });
    },
  );
}

function registerApply(api: FastifyInstance, services: MenuPriceServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().post(
    path + "/apply",
    {
      config,
      schema: {
        params: merchantParams,
        headers: sessionBoundCommandHeaders,
        body: bulkPriceApplyInput,
        response: { 201: bulkPriceApplyOutput, ...errors },
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
      const { accountId, now, repository } = context;
      const { adjustment, roundingUnit, expectedRevision } = request.body;
      const input = {
        itemIds: canonicalItemIds(request.body.itemIds),
        adjustment,
        roundingUnit,
        expectedRevision,
      };
      const result = await repository.apply({
        accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        input,
        now,
        ...commandIdentity(request.headers["idempotency-key"], input),
      });
      return "batchId" in result
        ? reply
            .code(201)
            .send({ batchId: result.batchId, revision: result.revision, items: [...result.items] })
        : priceProblem(reply, result.kind);
    },
  );
}

const batchParams = z.strictObject({ merchantId: z.uuid(), batchId: z.uuid() });

function registerUndo(api: FastifyInstance, services: MenuPriceServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().post(
    path + "/batches/:batchId/undo",
    {
      config,
      schema: {
        params: batchParams,
        headers: sessionBoundCommandHeaders,
        body: bulkPriceUndoInput,
        response: { 200: bulkPriceUndoOutput, ...errors },
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
      const { accountId, now, repository } = context;
      const input = {
        batchId: request.params.batchId.toLowerCase(),
        expectedRevision: request.body.expectedRevision,
      };
      const result = await repository.undo({
        accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        input,
        now,
        ...commandIdentity(request.headers["idempotency-key"], input),
      });
      return "batchId" in result
        ? reply.send({
            batchId: result.batchId,
            revision: result.revision,
            items: [...result.items],
          })
        : priceProblem(reply, result.kind);
    },
  );
}

export function registerMenuPriceRoutes(
  api: FastifyInstance,
  services: MenuPriceServices | undefined,
) {
  registerPreview(api, services);
  registerApply(api, services);
  registerUndo(api, services);
}
