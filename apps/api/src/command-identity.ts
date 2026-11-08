import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

export function commandIdentity(key: string, request: object) {
  return {
    idempotencyKeyHash: createHash("sha256").update(key).digest(),
    requestHash: createHash("sha256").update(JSON.stringify(request)).digest(),
  };
}

export function resolveSessionCommand<Repository>({
  request,
  reply,
  services,
  expectedSessionId,
}: {
  request: FastifyRequest;
  reply: FastifyReply;
  services: { readonly repository: Repository; readonly now: () => Date } | undefined;
  expectedSessionId: string;
}) {
  const actor = getRequestActor(request);
  if (!actor) {
    sendProblem(reply, 401);
    return undefined;
  }
  if (!services) {
    sendProblem(reply, 503);
    return undefined;
  }
  if (expectedSessionId.toLowerCase() !== actor.sessionId) {
    sendProblem(reply, 409, "session_changed");
    return undefined;
  }
  return {
    accountId: actor.accountId,
    sessionId: actor.sessionId,
    now: services.now(),
    repository: services.repository,
  };
}
