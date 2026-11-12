import { createHash } from "node:crypto";
import { sessionBoundCommandHeaders } from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  staffInvitationAcceptInput,
  staffInvitationAcceptOutput,
  staffInvitationInput,
  staffInvitationOutput,
  staffInvitationParams,
  staffListOutput,
  staffRevokeOutput,
} from "@zaafran/contracts/merchant-staff";
import type { createMerchantStaffRepository } from "@zaafran/db/merchant-staff";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commandIdentity, resolveSessionCommand } from "./command-identity.js";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

export interface MerchantStaffServices {
  readonly repository: ReturnType<typeof createMerchantStaffRepository>;
  readonly now: () => Date;
  /** A 32-byte Base64url secret scoped to the invitation command. Only its SHA-256 is stored. */
  readonly createToken: (scope: {
    merchantId: string;
    accountId: string;
    idempotencyKey: string;
  }) => string;
  readonly sendInvitation: (message: {
    phone: string;
    token: string;
    deliveryKey: string;
  }) => Promise<void> | void;
}

const path = "/v1/merchants/:merchantId/staff";
// Sessions resolve to customer; owner-only access is checked in SQL (D-015).
const ownerConfig = { policy: { kind: "roles", roles: ["customer", "merchant_owner"] } } as const;
const memberConfig = {
  policy: {
    kind: "roles",
    roles: ["customer", "merchant_owner", "merchant_manager", "merchant_staff"],
  },
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
  already_member: 409,
  already_invited: 409,
  already_consumed: 409,
  idempotency_conflict: 409,
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest();
}

function registerList(api: FastifyInstance, services: MerchantStaffServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().get(
    path,
    {
      config: ownerConfig,
      schema: { params: merchantParams, response: { 200: staffListOutput, ...errors } },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      reply.header("cache-control", "no-store");
      const merchantId = request.params.merchantId.toLowerCase();
      const staff = await services.repository.list({
        accountId: actor.accountId,
        merchantId,
        now: services.now(),
      });
      if (!staff) return sendProblem(reply, 404, "not_found");
      return reply.send({ sessionId: actor.sessionId, merchantId, ...staff });
    },
  );
}

function registerInvite(api: FastifyInstance, services: MerchantStaffServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().post(
    `${path}/invitations`,
    {
      config: ownerConfig,
      schema: {
        headers: sessionBoundCommandHeaders,
        params: merchantParams,
        body: staffInvitationInput,
        response: { 201: staffInvitationOutput, ...errors },
      },
    },
    async (request, reply) => {
      const command = resolveSessionCommand({
        request,
        reply,
        services,
        expectedSessionId: request.headers["x-expected-session-id"],
      });
      if (!command || !services) return reply;
      const merchantId = request.params.merchantId.toLowerCase();
      const idempotencyKey = request.headers["idempotency-key"];
      const token = services.createToken({
        merchantId,
        accountId: command.accountId,
        idempotencyKey,
      });
      const result = await command.repository.create({
        accountId: command.accountId,
        merchantId,
        ...request.body,
        tokenHash: hashToken(token),
        now: command.now,
        ...commandIdentity(idempotencyKey, { merchantId, ...request.body }),
      });
      if (!("invitation" in result)) {
        return sendProblem(reply, failureStatus[result.kind], result.kind);
      }
      const { invitation } = result;
      if (result.kind === "applied" || result.isOpen) {
        try {
          await services.sendInvitation({
            phone: invitation.phoneE164,
            token,
            deliveryKey: invitation.invitationId,
          });
        } catch {
          return sendProblem(reply, 503, "invitation_delivery_unavailable");
        }
      }
      return reply.code(201).send(invitation);
    },
  );
}

function registerRevoke(api: FastifyInstance, services: MerchantStaffServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().post(
    `${path}/invitations/:invitationId/revoke`,
    {
      config: ownerConfig,
      schema: {
        headers: sessionBoundCommandHeaders,
        params: staffInvitationParams,
        response: { 200: staffRevokeOutput, ...errors },
      },
    },
    async (request, reply) => {
      const command = resolveSessionCommand({
        request,
        reply,
        services,
        expectedSessionId: request.headers["x-expected-session-id"],
      });
      if (!command) return reply;
      const invitationId = request.params.invitationId.toLowerCase();
      const result = await command.repository.revoke({
        accountId: command.accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        invitationId,
        now: command.now,
      });
      if (result.kind !== "revoked") {
        return sendProblem(reply, failureStatus[result.kind], result.kind);
      }
      return reply.send({ invitationId, status: "revoked" });
    },
  );
}

function registerAccept(api: FastifyInstance, services: MerchantStaffServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().post(
    "/v1/staff-invitations/accept",
    {
      config: memberConfig,
      schema: {
        body: staffInvitationAcceptInput,
        response: { 200: staffInvitationAcceptOutput, ...errors },
      },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const result = await services.repository.accept({
        accountId: actor.accountId,
        tokenHash: hashToken(request.body.token),
        now: services.now(),
      });
      if (result.kind !== "accepted") {
        return sendProblem(reply, failureStatus[result.kind], result.kind);
      }
      const { merchantId, restaurantName, role } = result;
      return reply.send({ merchantId, restaurantName, role });
    },
  );
}

/** MER-23 owner-managed staff invitations and their phone-bound acceptance (D-015). */
export function registerMerchantStaffRoutes(
  api: FastifyInstance,
  services: MerchantStaffServices | undefined,
): void {
  registerList(api, services);
  registerInvite(api, services);
  registerRevoke(api, services);
  registerAccept(api, services);
}
