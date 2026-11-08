import { sessionBoundCommandHeaders } from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  menuItemArchiveOutput,
  menuItemAvailabilityInput,
  menuItemAvailabilityOutput,
  menuItemCommandInput,
  menuItemPageOutput,
  menuItemPageQuery,
  menuItemRevisionInput,
  menuItemWriteOutput,
  readMenuItemCursor,
} from "@zaafran/contracts/menu";
import type { createMenuItemRepository } from "@zaafran/db/menu-item";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commandIdentity, resolveSessionCommand } from "./command-identity.js";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type Repository = ReturnType<typeof createMenuItemRepository>;
export interface MenuItemServices {
  readonly repository: Repository;
  readonly now: () => Date;
}

const path = "/v1/merchants/:merchantId/menu/items";
const itemPath = path + "/:itemId";
const editorRoles = ["customer", "merchant_owner", "merchant_manager"] as const;
const editorConfig = { policy: { kind: "roles", roles: editorRoles } } as const;
const availabilityConfig = {
  policy: { kind: "roles", roles: [...editorRoles, "merchant_staff"] },
} as const;
const merchantParams = z.strictObject({ merchantId: z.uuid() });
const itemParams = merchantParams.extend({ itemId: z.uuid() });
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
  invalid_cursor: 400,
  not_found: 404,
  revision_conflict: 409,
  idempotency_conflict: 409,
  photos_unavailable: 409,
};

function itemProblem(reply: FastifyReply, kind: keyof typeof failureStatus): FastifyReply {
  return sendProblem(reply, failureStatus[kind], kind);
}

function writeItemResponse(
  reply: FastifyReply,
  result: Awaited<ReturnType<Repository["create"]>>,
  status: 200 | 201,
) {
  return "item" in result
    ? reply.code(status).send({ item: result.item, revision: result.revision })
    : itemProblem(reply, result.kind);
}

function canonicalItemInput(input: z.infer<typeof menuItemCommandInput>) {
  return {
    ...input,
    categoryId: input.categoryId.toLowerCase(),
    optionGroupIds: input.optionGroupIds.map((id) => id.toLowerCase()),
  };
}

function registerList(api: FastifyInstance, services: MenuItemServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().get(
    path,
    {
      config: editorConfig,
      schema: {
        params: merchantParams,
        querystring: menuItemPageQuery,
        response: { 200: menuItemPageOutput, ...errors },
      },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      reply.header("cache-control", "no-store");
      const { categoryId, limit, cursor } = request.query;
      const parsedCursor = cursor === undefined ? undefined : readMenuItemCursor(cursor);
      const result = await services.repository.list({
        accountId: actor.accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        categoryId: categoryId.toLowerCase(),
        limit,
        now: services.now(),
        ...(parsedCursor === undefined ? {} : { cursor: parsedCursor }),
      });
      if (result.kind !== "listed") return itemProblem(reply, result.kind);
      const { revision, items, nextCursor, context } = result;
      return reply.send({ sessionId: actor.sessionId, revision, items, nextCursor, context });
    },
  );
}

function registerItemEdits(api: FastifyInstance, services: MenuItemServices | undefined) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  const schema = { headers: sessionBoundCommandHeaders, body: menuItemCommandInput };
  routes.post(
    path,
    {
      config: editorConfig,
      schema: {
        ...schema,
        params: merchantParams,
        response: { 201: menuItemWriteOutput, ...errors },
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
      if (request.body.photoId !== null) return itemProblem(reply, "photos_unavailable");
      const { accountId, repository, now } = context;
      const input = canonicalItemInput(request.body);
      const result = await repository.create({
        accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        input,
        now,
        ...commandIdentity(request.headers["idempotency-key"], input),
      });
      return writeItemResponse(reply, result, 201);
    },
  );
  routes.put(
    itemPath,
    {
      config: editorConfig,
      schema: { ...schema, params: itemParams, response: { 200: menuItemWriteOutput, ...errors } },
    },
    async (request, reply) => {
      const context = resolveSessionCommand({
        request,
        reply,
        services,
        expectedSessionId: request.headers["x-expected-session-id"],
      });
      if (!context) return reply;
      if (request.body.photoId !== null) return itemProblem(reply, "photos_unavailable");
      const { accountId, repository, now } = context;
      const itemId = request.params.itemId.toLowerCase();
      const input = canonicalItemInput(request.body);
      const result = await repository.update({
        accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        itemId,
        input,
        now,
        ...commandIdentity(request.headers["idempotency-key"], { itemId, ...input }),
      });
      return writeItemResponse(reply, result, 200);
    },
  );
}

function registerLifecycle(api: FastifyInstance, services: MenuItemServices | undefined) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  const schema = {
    params: itemParams,
    headers: sessionBoundCommandHeaders,
    body: menuItemRevisionInput,
  };
  routes.post(
    itemPath + "/duplicate",
    {
      config: editorConfig,
      schema: { ...schema, response: { 201: menuItemWriteOutput, ...errors } },
    },
    async (request, reply) => {
      const context = resolveSessionCommand({
        request,
        reply,
        services,
        expectedSessionId: request.headers["x-expected-session-id"],
      });
      if (!context) return reply;
      const { accountId, repository, now } = context;
      const itemId = request.params.itemId.toLowerCase();
      const input = request.body;
      const result = await repository.duplicate({
        accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        itemId,
        input,
        now,
        ...commandIdentity(request.headers["idempotency-key"], { itemId, ...input }),
      });
      return writeItemResponse(reply, result, 201);
    },
  );
  routes.post(
    itemPath + "/archive",
    {
      config: editorConfig,
      schema: { ...schema, response: { 200: menuItemArchiveOutput, ...errors } },
    },
    async (request, reply) => {
      const context = resolveSessionCommand({
        request,
        reply,
        services,
        expectedSessionId: request.headers["x-expected-session-id"],
      });
      if (!context) return reply;
      const { accountId, repository, now } = context;
      const itemId = request.params.itemId.toLowerCase();
      const input = request.body;
      const result = await repository.archive({
        accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        itemId,
        input,
        now,
        ...commandIdentity(request.headers["idempotency-key"], { itemId, ...input }),
      });
      if (!("itemId" in result)) return itemProblem(reply, result.kind);
      return reply.send({
        itemId: result.itemId,
        archivedAt: result.archivedAt,
        revision: result.revision,
      });
    },
  );
}

function registerAvailability(api: FastifyInstance, services: MenuItemServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().put(
    itemPath + "/availability",
    {
      config: availabilityConfig,
      schema: {
        params: itemParams,
        headers: sessionBoundCommandHeaders,
        body: menuItemAvailabilityInput,
        response: { 200: menuItemAvailabilityOutput, ...errors },
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
      const { accountId, repository, now } = context;
      const itemId = request.params.itemId.toLowerCase();
      const input = request.body;
      const result = await repository.setAvailability({
        accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        itemId,
        input,
        now,
        ...commandIdentity(request.headers["idempotency-key"], { itemId, ...input }),
      });
      if (!("itemId" in result)) return itemProblem(reply, result.kind);
      return reply.send({
        itemId: result.itemId,
        isAvailable: result.isAvailable,
        soldOutUntil: result.soldOutUntil,
        revision: result.revision,
      });
    },
  );
}

export function registerMenuItemRoutes(
  api: FastifyInstance,
  services: MenuItemServices | undefined,
) {
  registerList(api, services);
  registerItemEdits(api, services);
  registerLifecycle(api, services);
  registerAvailability(api, services);
}
