import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  adminDashboardTodayOutput,
  merchantAnalyticsOutput,
  merchantAnalyticsQuery,
} from "@zaafran/contracts/retention";
import type { createOrderRepository } from "@zaafran/db/orders";
import { getAlgiersDate } from "@zaafran/domain/hours";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type Services = {
  repository: Pick<
    ReturnType<typeof createOrderRepository>,
    "merchantAnalytics" | "adminDashboard"
  >;
  now: () => Date;
};
const errors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};

function observeApiRequests(api: FastifyInstance, now: () => Date) {
  let day = "";
  let requests = 0;
  let failed = 0;
  api.addHook("onResponse", (request, reply, done) => {
    if (request.routeOptions.url?.startsWith("/v1/")) {
      const current = getAlgiersDate(now().getTime()).isoDate;
      if (current !== day) {
        day = current;
        requests = 0;
        failed = 0;
      }
      requests++;
      if (reply.statusCode >= 500) failed++;
    }
    done();
  });
  return (date: string) => (requests && date === day ? Math.round((failed * 10000) / requests) : 0);
}

export function registerAnalyticsRoutes(api: FastifyInstance, services?: Services) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  const errorRate = services && observeApiRequests(api, services.now);
  routes.get(
    "/v1/merchants/:merchantId/analytics",
    {
      config: {
        policy: { kind: "roles", roles: ["customer", "merchant_owner", "merchant_manager"] },
      },
      schema: {
        params: z.strictObject({ merchantId: z.uuid() }),
        querystring: merchantAnalyticsQuery,
        response: { 200: merchantAnalyticsOutput, ...errors },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const { from, to } = request.query;
      if (Date.parse(to) - Date.parse(from) >= 366 * 86_400_000)
        return sendProblem(reply, 400, "analytics_range_too_large");
      const result = await services.repository.merchantAnalytics({
        ...request.params,
        from,
        to,
        accountId: actor.accountId,
        sessionId: actor.sessionId,
      });
      return result ? reply.send(result) : sendProblem(reply, 404);
    },
  );
  routes.get(
    "/v1/admin/dashboard/today",
    {
      config: { policy: { kind: "roles", roles: ["admin"] } },
      schema: { response: { 200: adminDashboardTodayOutput, ...errors } },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services || !errorRate) return sendProblem(reply, 503);
      const now = services.now();
      const date = getAlgiersDate(now.getTime()).isoDate;
      const result = await services.repository.adminDashboard({
        accountId: actor.accountId,
        date,
        now,
        errorRate: errorRate(date),
      });
      return result ? reply.send(result) : sendProblem(reply, 403);
    },
  );
}
