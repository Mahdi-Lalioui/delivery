import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  merchantHoursPreviewOutput,
  merchantHoursPreviewQuery,
  merchantRamadanOutput,
} from "@zaafran/contracts/merchant-hours";
import type { createMerchantHoursRepository } from "@zaafran/db/merchant-hours";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { buildHoursPreview } from "./merchant-hours-preview.js";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type Repository = ReturnType<typeof createMerchantHoursRepository>;
export interface MerchantHoursPreviewServices {
  readonly repository: Pick<Repository, "readSchedule">;
  readonly now: () => Date;
}

// The preview follows the hours roles: owners and managers (D-011).
const config = {
  policy: { kind: "roles", roles: ["customer", "merchant_owner", "merchant_manager"] },
} as const;
const errors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};

export function registerMerchantHoursPreviewRoute(
  api: FastifyInstance,
  services: MerchantHoursPreviewServices | undefined,
) {
  api.withTypeProvider<ZodTypeProvider>().get(
    "/v1/merchants/:merchantId/hours/preview",
    {
      config,
      schema: {
        params: z.strictObject({ merchantId: z.uuid() }),
        querystring: merchantHoursPreviewQuery,
        response: { 200: merchantHoursPreviewOutput, ...errors },
      },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      reply.header("cache-control", "no-store");
      const stored = await services.repository.readSchedule({
        accountId: actor.accountId,
        merchantId: request.params.merchantId.toLowerCase(),
      });
      if (!stored) return sendProblem(reply, 404, "not_found");
      // Stored schedules were parsed by merchantRamadanCommandInput; a drifted row becomes a 500.
      const ramadan = merchantRamadanOutput.shape.schedule.parse(stored.ramadan);
      const { schedule } = request.query;
      const now = services.now();
      return reply.send(buildHoursPreview({ schedule, stored: { ...stored, ramadan }, now }));
    },
  );
}
