import { sessionBoundCommandHeaders } from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  menuImportApplyInput,
  menuImportApplyOutput,
  menuImportInput,
  menuImportPreviewOutput,
} from "@zaafran/contracts/menu-import";
import type { createMenuImportRepository } from "@zaafran/db/menu-import";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commandIdentity, resolveSessionCommand } from "./command-identity.js";
import { createImportPreviewToken, matchesImportPreviewToken } from "./menu-import-preview.js";
import { validateMenuImportRows } from "./menu-import-rows.js";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type Repository = ReturnType<typeof createMenuImportRepository>;
export interface MenuImportServices {
  readonly repository: Repository;
  readonly now: () => Date;
  readonly previewKey: Uint8Array;
}

const path = "/v1/merchants/:merchantId/menu/import";
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
  413: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};
const emptySummary = {
  categoriesCreated: 0,
  itemsCreated: 0,
  itemsUpdated: 0,
  itemsUnchanged: 0,
};

function registerPreview(api: FastifyInstance, services: MenuImportServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().post(
    path + "/preview",
    {
      config,
      schema: {
        params: merchantParams,
        body: menuImportInput,
        response: { 200: menuImportPreviewOutput, ...errors },
      },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      reply.header("cache-control", "no-store");
      const merchantId = request.params.merchantId.toLowerCase();
      const validated = validateMenuImportRows(request.body.rows);
      const result = await services.repository.preview({
        accountId: actor.accountId,
        merchantId,
        expectedRevision: request.body.expectedRevision,
        rows: validated.errors.length > 0 ? [] : validated.rows,
      });
      if (result.kind !== "previewed") {
        return sendProblem(reply, result.kind === "not_found" ? 404 : 409, result.kind);
      }

      const rowErrors = [...validated.errors, ...result.errors];
      const isValid = rowErrors.length === 0;
      const previewToken = isValid
        ? createImportPreviewToken(services.previewKey, {
            accountId: actor.accountId,
            merchantId,
            sessionId: actor.sessionId,
            revision: result.revision,
            rows: validated.rows,
          })
        : null;
      return reply.send({
        sessionId: actor.sessionId,
        revision: result.revision,
        errors: rowErrors,
        summary: isValid ? result.summary : emptySummary,
        previewToken,
      });
    },
  );
}

function registerApply(api: FastifyInstance, services: MenuImportServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().post(
    path + "/apply",
    {
      config,
      schema: {
        params: merchantParams,
        headers: sessionBoundCommandHeaders,
        body: menuImportApplyInput,
        response: { 201: menuImportApplyOutput, ...errors },
      },
    },
    async (request, reply) => {
      const context = resolveSessionCommand({
        request,
        reply,
        services,
        expectedSessionId: request.headers["x-expected-session-id"],
      });
      if (!context || !services) return reply;
      reply.header("cache-control", "no-store");
      const { accountId, sessionId, now, repository } = context;
      const merchantId = request.params.merchantId.toLowerCase();
      const validated = validateMenuImportRows(request.body.rows);
      if (validated.errors.length > 0) return sendProblem(reply, 400, "invalid_import_rows");
      const input = { expectedRevision: request.body.expectedRevision, rows: validated.rows };
      const isValid = matchesImportPreviewToken(
        services.previewKey,
        { accountId, merchantId, sessionId, revision: input.expectedRevision, rows: input.rows },
        request.body.previewToken,
      );
      if (!isValid) return sendProblem(reply, 409, "invalid_preview_token");

      const result = await repository.apply({
        accountId,
        merchantId,
        input,
        now,
        ...commandIdentity(request.headers["idempotency-key"], { sessionId, ...input }),
      });
      if ("summary" in result) {
        return reply.code(201).send({ revision: result.revision, summary: result.summary });
      }
      return sendProblem(reply, result.kind === "not_found" ? 404 : 409, result.kind);
    },
  );
}

export function registerMenuImportRoutes(
  api: FastifyInstance,
  services: MenuImportServices | undefined,
) {
  registerPreview(api, services);
  registerApply(api, services);
}
