import { sessionBoundCommandHeaders } from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  menuOptionGroupCreateInput,
  menuOptionGroupDetailOutput,
  menuOptionGroupPageOutput,
  menuOptionGroupPageQuery,
  menuOptionGroupUpdateInput,
  menuOptionGroupWriteOutput,
  readMenuOptionGroupCursor,
} from "@zaafran/contracts/menu";
import type { createMenuOptionGroupRepository } from "@zaafran/db/menu-option-group";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commandIdentity, resolveSessionCommand } from "./command-identity.js";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type Repository = ReturnType<typeof createMenuOptionGroupRepository>;

export interface MenuOptionGroupServices {
  readonly repository: Repository;
  readonly now: () => Date;
}

const path = "/v1/merchants/:merchantId/menu/option-groups";
const detailPath = path + "/:optionGroupId";
const config = {
  policy: { kind: "roles", roles: ["customer", "merchant_owner", "merchant_manager"] },
} as const;
const merchantParams = z.strictObject({ merchantId: z.uuid() });
const optionGroupParams = merchantParams.extend({ optionGroupId: z.uuid() });
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
};

function groupProblem(reply: FastifyReply, kind: keyof typeof failureStatus): FastifyReply {
  return sendProblem(reply, failureStatus[kind], kind);
}

function writeGroupResponse(
  reply: FastifyReply,
  result: Awaited<ReturnType<Repository["create"]>>,
  status: 200 | 201,
) {
  return "optionGroup" in result
    ? reply.code(status).send({ optionGroup: result.optionGroup, revision: result.revision })
    : groupProblem(reply, result.kind);
}

function registerGroupReads(api: FastifyInstance, services: MenuOptionGroupServices | undefined) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  routes.get(
    path,
    {
      config,
      schema: {
        params: merchantParams,
        querystring: menuOptionGroupPageQuery,
        response: { 200: menuOptionGroupPageOutput, ...errors },
      },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      reply.header("cache-control", "no-store");
      const { limit, cursor } = request.query;
      const parsedCursor = cursor === undefined ? undefined : readMenuOptionGroupCursor(cursor);
      const result = await services.repository.list({
        accountId: actor.accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        limit,
        ...(parsedCursor === undefined ? {} : { cursor: parsedCursor }),
      });
      if (result.kind !== "listed") return groupProblem(reply, result.kind);
      const { revision, optionGroups, nextCursor, context } = result;
      return reply.send({
        sessionId: actor.sessionId,
        revision,
        optionGroups,
        nextCursor,
        context,
      });
    },
  );
  routes.get(
    detailPath,
    {
      config,
      schema: {
        params: optionGroupParams,
        response: { 200: menuOptionGroupDetailOutput, ...errors },
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
        optionGroupId: request.params.optionGroupId.toLowerCase(),
      });
      if (result.kind !== "found") return groupProblem(reply, result.kind);
      return reply.send({
        sessionId: actor.sessionId,
        revision: result.revision,
        optionGroup: result.optionGroup,
      });
    },
  );
}

function registerGroupWrites(api: FastifyInstance, services: MenuOptionGroupServices | undefined) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  routes.post(
    path,
    {
      config,
      schema: {
        params: merchantParams,
        headers: sessionBoundCommandHeaders,
        body: menuOptionGroupCreateInput,
        response: { 201: menuOptionGroupWriteOutput, ...errors },
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
      const input = request.body;
      const result = await repository.create({
        accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        input,
        now,
        ...commandIdentity(request.headers["idempotency-key"], input),
      });
      return writeGroupResponse(reply, result, 201);
    },
  );
  routes.put(
    detailPath,
    {
      config,
      schema: {
        params: optionGroupParams,
        headers: sessionBoundCommandHeaders,
        body: menuOptionGroupUpdateInput,
        response: { 200: menuOptionGroupWriteOutput, ...errors },
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
      const optionGroupId = request.params.optionGroupId.toLowerCase();
      const input = {
        ...request.body,
        options: request.body.options.map(({ optionId, ...option }) =>
          optionId === undefined ? option : { ...option, optionId: optionId.toLowerCase() },
        ),
      };
      const result = await repository.update({
        accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        optionGroupId,
        input,
        now,
        ...commandIdentity(request.headers["idempotency-key"], { optionGroupId, ...input }),
      });
      return writeGroupResponse(reply, result, 200);
    },
  );
}

export function registerMenuOptionGroupRoutes(
  api: FastifyInstance,
  services: MenuOptionGroupServices | undefined,
) {
  registerGroupReads(api, services);
  registerGroupWrites(api, services);
}
