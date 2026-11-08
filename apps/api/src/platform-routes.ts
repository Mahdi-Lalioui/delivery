import { createHash } from "node:crypto";
import {
  adminAuditOutput,
  adminAuditQuery,
  adminFlagInput,
  adminFlagOutput,
  adminPlatformSettingInput,
  adminPlatformSettingsOutput,
  featureFlagKey,
  platformSettingKey,
  platformSettingValue,
  publicFlagsOutput,
} from "@zaafran/contracts/admin-ops";
import { sessionBoundCommandHeaders } from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import type { createPlatformRepository } from "@zaafran/db/platform";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commandIdentity, resolveSessionCommand } from "./command-identity.js";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type Repository = ReturnType<typeof createPlatformRepository>;
export interface PlatformServices {
  readonly repository: Repository;
  readonly now: () => Date;
}

const config = { policy: { kind: "roles", roles: ["admin"] } } as const;
const errors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  409: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};

async function readAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  {
    services,
    read,
  }: {
    services: PlatformServices | undefined;
    read: (repository: Repository, accountId: string) => Promise<object | undefined>;
  },
) {
  reply.header("cache-control", "no-store");
  const actor = getRequestActor(request);
  if (!actor) return sendProblem(reply, 401);
  if (!services) return sendProblem(reply, 503);
  const value = await read(services.repository, actor.accountId);
  return value ? reply.send({ ...value, sessionId: actor.sessionId }) : sendProblem(reply, 403);
}

function presentAdminCommand(
  reply: FastifyReply,
  result: { kind: "applied" | "replayed"; value: object } | { kind: string },
  sessionId?: string,
) {
  if ("value" in result)
    return reply.send(sessionId ? { ...result.value, sessionId } : result.value);
  if (result.kind === "forbidden") return sendProblem(reply, 403);
  if (result.kind === "invalid_setting_value") return sendProblem(reply, 400, result.kind);
  return sendProblem(reply, 409, result.kind);
}

function registerPublicFlags(api: FastifyInstance, services: PlatformServices | undefined) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  routes.get(
    "/v1/flags",
    {
      config: { policy: { kind: "public" } },
      schema: { response: { 200: publicFlagsOutput, 304: z.void(), ...errors } },
    },
    async (request, reply) => {
      if (!services) return sendProblem(reply, 503);
      const value = publicFlagsOutput.parse(await services.repository.readPublicFlags());
      const hash = createHash("sha256").update(JSON.stringify(value)).digest("hex");
      const tag = '"' + hash + '"';
      reply.header("cache-control", "public, no-cache").header("etag", "W/" + tag);
      const candidates = request.headers["if-none-match"]?.split(",") ?? [];
      if (
        candidates.some((candidate) => {
          const match = candidate.trim();
          return match === "*" || match === tag || match === "W/" + tag;
        })
      ) {
        return reply.code(304).send();
      }
      return reply.send(value);
    },
  );
}

export function registerPlatformRoutes(
  api: FastifyInstance,
  services: PlatformServices | undefined,
) {
  registerPublicFlags(api, services);
  const routes = api.withTypeProvider<ZodTypeProvider>();
  const headers = sessionBoundCommandHeaders;
  routes.get(
    "/v1/admin/settings",
    { config, schema: { response: { 200: adminPlatformSettingsOutput, ...errors } } },
    (request, reply) =>
      readAdmin(request, reply, {
        services,
        read: (repo, accountId) => repo.readAdminSettings(accountId),
      }),
  );
  routes.put(
    "/v1/admin/settings/:key",
    {
      config,
      schema: {
        params: z.strictObject({ key: platformSettingKey }),
        headers,
        body: adminPlatformSettingInput,
        response: { 200: adminPlatformSettingsOutput, ...errors },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const actor = resolveSessionCommand({
        request,
        reply,
        services,
        expectedSessionId: request.headers["x-expected-session-id"],
      });
      if (!actor) return reply;
      const { key } = request.params;
      const value = platformSettingValue[key].safeParse(request.body.value);
      if (!value.success) return sendProblem(reply, 400, "invalid_setting_value");
      const input = { value: value.data, reason: request.body.reason };
      return presentAdminCommand(
        reply,
        await actor.repository.updateSetting({
          adminUserId: actor.accountId,
          key,
          input,
          now: actor.now,
          ...commandIdentity(request.headers["idempotency-key"], { key, input }),
        }),
        actor.sessionId,
      );
    },
  );
  routes.put(
    "/v1/admin/flags/:key",
    {
      config,
      schema: {
        params: z.strictObject({ key: featureFlagKey }),
        headers,
        body: adminFlagInput,
        response: { 200: adminFlagOutput, ...errors },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const actor = resolveSessionCommand({
        request,
        reply,
        services,
        expectedSessionId: request.headers["x-expected-session-id"],
      });
      if (!actor) return reply;
      const key = request.params.key.toLowerCase();
      const input = request.body;
      return presentAdminCommand(
        reply,
        await actor.repository.updateFlag({
          adminUserId: actor.accountId,
          key,
          input,
          now: actor.now,
          ...commandIdentity(request.headers["idempotency-key"], { key, input }),
        }),
      );
    },
  );
  routes.get(
    "/v1/admin/audit",
    {
      config,
      schema: { querystring: adminAuditQuery, response: { 200: adminAuditOutput, ...errors } },
    },
    (request, reply) =>
      readAdmin(request, reply, {
        services,
        read: (repo, adminUserId) => repo.listAudit({ ...request.query, adminUserId }),
      }),
  );
}
