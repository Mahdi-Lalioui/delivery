import { sessionBoundCommandHeaders } from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  menuCategoryCommandInput,
  menuCategoryOrderInput,
  menuCategoryOrderOutput,
  menuCategoryPageOutput,
  menuCategoryPageQuery,
  menuCategoryWriteOutput,
  readMenuCategoryCursor,
} from "@zaafran/contracts/menu";
import type { createMenuCategoryRepository } from "@zaafran/db/menu-category";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commandIdentity, resolveMenuCommand } from "./command-identity.js";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

export interface MenuCategoryServices {
  readonly repository: ReturnType<typeof createMenuCategoryRepository>;
  readonly now: () => Date;
}

const path = "/v1/merchants/:merchantId/menu/categories";
const config = {
  policy: { kind: "roles", roles: ["customer", "merchant_owner", "merchant_manager"] },
} as const;
const merchantParams = z.strictObject({ merchantId: z.uuid() });
const categoryParams = merchantParams.extend({ categoryId: z.uuid() });
const errors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  409: problemResponseSchema,
  422: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};
const failureStatus = {
  not_found: 404,
  revision_conflict: 409,
  idempotency_conflict: 409,
  category_limit: 409,
  invalid_order: 422,
};

function categoryProblem(reply: FastifyReply, kind: keyof typeof failureStatus): FastifyReply {
  return sendProblem(reply, failureStatus[kind], kind);
}

function registerCategoryList(api: FastifyInstance, services: MenuCategoryServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().get(
    path,
    {
      config,
      schema: {
        params: merchantParams,
        querystring: menuCategoryPageQuery,
        response: { 200: menuCategoryPageOutput, ...errors },
      },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      reply.header("cache-control", "no-store");
      const { limit, cursor } = request.query;
      const parsedCursor = cursor === undefined ? undefined : readMenuCategoryCursor(cursor);
      const result = await services.repository.list({
        accountId: actor.accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        limit,
        ...(parsedCursor === undefined ? {} : { cursor: parsedCursor }),
      });
      if (result.kind !== "listed") return categoryProblem(reply, result.kind);
      const { revision, categories, nextCursor, context } = result;
      return reply.send({ sessionId: actor.sessionId, revision, categories, nextCursor, context });
    },
  );
}

function registerCategoryCreate(api: FastifyInstance, services: MenuCategoryServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().post(
    path,
    {
      config,
      schema: {
        params: merchantParams,
        headers: sessionBoundCommandHeaders,
        body: menuCategoryCommandInput,
        response: { 201: menuCategoryWriteOutput, ...errors },
      },
    },
    async (request, reply) => {
      const context = resolveMenuCommand({
        request,
        reply,
        services,
        expectedSessionId: request.headers["x-expected-session-id"],
      });
      if (!context) return reply;
      const { accountId, now, repository } = context;
      const input = request.body;
      const result = await repository.create({
        accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        input,
        now,
        ...commandIdentity(request.headers["idempotency-key"], input),
      });
      return "category" in result
        ? reply.code(201).send({ category: result.category, revision: result.revision })
        : categoryProblem(reply, result.kind);
    },
  );
}

function registerCategoryRename(api: FastifyInstance, services: MenuCategoryServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().put(
    path + "/:categoryId",
    {
      config,
      schema: {
        params: categoryParams,
        headers: sessionBoundCommandHeaders,
        body: menuCategoryCommandInput,
        response: { 200: menuCategoryWriteOutput, ...errors },
      },
    },
    async (request, reply) => {
      const context = resolveMenuCommand({
        request,
        reply,
        services,
        expectedSessionId: request.headers["x-expected-session-id"],
      });
      if (!context) return reply;
      const { accountId, now, repository } = context;
      const categoryId = request.params.categoryId.toLowerCase();
      const input = request.body;
      const result = await repository.rename({
        accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        categoryId,
        input,
        now,
        ...commandIdentity(request.headers["idempotency-key"], { categoryId, ...input }),
      });
      return "category" in result
        ? reply.send({ category: result.category, revision: result.revision })
        : categoryProblem(reply, result.kind);
    },
  );
}

function registerCategoryReorder(api: FastifyInstance, services: MenuCategoryServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().put(
    path + "/order",
    {
      config,
      schema: {
        params: merchantParams,
        headers: sessionBoundCommandHeaders,
        body: menuCategoryOrderInput,
        response: { 200: menuCategoryOrderOutput, ...errors },
      },
    },
    async (request, reply) => {
      const context = resolveMenuCommand({
        request,
        reply,
        services,
        expectedSessionId: request.headers["x-expected-session-id"],
      });
      if (!context) return reply;
      const { accountId, now, repository } = context;
      const { categoryIds, expectedRevision } = request.body;
      const input = {
        categoryIds: categoryIds.map((categoryId) => categoryId.toLowerCase()),
        expectedRevision,
      };
      const result = await repository.reorder({
        accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        input,
        now,
        ...commandIdentity(request.headers["idempotency-key"], input),
      });
      return "categoryIds" in result
        ? reply.send({ categoryIds: result.categoryIds, revision: result.revision })
        : categoryProblem(reply, result.kind);
    },
  );
}

export function registerMenuCategoryRoutes(
  api: FastifyInstance,
  services: MenuCategoryServices | undefined,
) {
  registerCategoryList(api, services);
  registerCategoryCreate(api, services);
  registerCategoryRename(api, services);
  registerCategoryReorder(api, services);
}
