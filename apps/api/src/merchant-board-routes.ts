import { problemResponseSchema } from "@zaafran/contracts/health";
import { merchantBoardOutput, merchantBoardQuery } from "@zaafran/contracts/orders";
import type { createOrderRepository } from "@zaafran/db/orders";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type BoardServices = Pick<ReturnType<typeof createOrderRepository>, "board">;

export function registerMerchantBoardRoutes(api: FastifyInstance, services?: BoardServices) {
  api.withTypeProvider<ZodTypeProvider>().get(
    "/v1/merchants/:merchantId/order-board",
    {
      config: {
        policy: { kind: "roles", roles: ["merchant_owner", "merchant_manager", "merchant_staff"] },
      },
      onSend(_request, reply, payload) {
        reply.header("cache-control", "no-store");
        return Promise.resolve(payload);
      },
      schema: {
        params: z.strictObject({ merchantId: z.uuid() }),
        querystring: merchantBoardQuery,
        response: {
          200: merchantBoardOutput,
          400: problemResponseSchema,
          401: problemResponseSchema,
          403: problemResponseSchema,
          404: problemResponseSchema,
          429: problemResponseSchema,
          503: problemResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const { after } = request.query;
      const board = await services.board({
        accountId: actor.accountId,
        merchantId: request.params.merchantId,
        ...(after === undefined ? {} : { after }),
      });
      return board ? reply.send(board) : sendProblem(reply, 404);
    },
  );
}
