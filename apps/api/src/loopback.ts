import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";
import { sendProblem } from "./problems.js";

const loopbackAddresses = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function requireLoopback(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
): void {
  if (!loopbackAddresses.has(request.ip)) {
    void sendProblem(reply, 403);
    return;
  }
  done();
}
