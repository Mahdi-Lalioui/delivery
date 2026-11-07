import { STATUS_CODES } from "node:http";
import type { FastifyReply } from "fastify";

const problemCodes: ReadonlyMap<number, string> = new Map([
  [400, "invalid_request"],
  [401, "unauthenticated"],
  [403, "forbidden"],
  [404, "not_found"],
  [413, "payload_too_large"],
  [429, "rate_limited"],
  [503, "not_ready"],
]);

export function sendProblem(reply: FastifyReply, status: number, code?: string): FastifyReply {
  return reply
    .code(status)
    .type("application/problem+json")
    .send({
      type: "about:blank",
      title: STATUS_CODES[status] ?? "Request failed",
      status,
      code:
        code ?? problemCodes.get(status) ?? (status >= 500 ? "internal_error" : "request_failed"),
      requestId: reply.request.id,
    });
}
