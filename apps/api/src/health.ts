import {
  healthResponseSchema,
  problemResponseSchema,
  readyResponseSchema,
} from "@zaafran/contracts/health";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { sendProblem } from "./problems.js";

const problem = { content: { "application/problem+json": { schema: problemResponseSchema } } };

export function registerHealth(api: FastifyInstance, checkReadiness: () => Promise<void>): void {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  routes.get(
    "/healthz",
    {
      config: { policy: { kind: "public" } },
      schema: { response: { 200: healthResponseSchema, 429: problem } },
    },
    () => ({ status: "ok" as const }),
  );
  routes.get(
    "/readyz",
    {
      config: { policy: { kind: "public" } },
      schema: { response: { 200: readyResponseSchema, 429: problem, 503: problem } },
    },
    async (request, reply) => {
      try {
        await checkReadiness();
      } catch {
        request.log.warn("Readiness dependency probe failed");
        return sendProblem(reply, 503);
      }
      return { status: "ready" as const };
    },
  );
}
