import { expect, test } from "vitest";
import { defineJob } from "../src/jobs.ts";
import { z } from "zod";

test("[M0-7] passes parsed payloads to the typed job handler", async () => {
  const processed: { orderId: number; attempts: number }[] = [];
  const job = defineJob(
    z.strictObject({
      orderId: z.string().transform(Number),
      attempts: z.number().default(1),
    }),
    (payload) => {
      processed.push(payload);
      return Promise.resolve();
    },
  );

  await job({ orderId: "42" });

  expect(processed).toEqual([{ orderId: 42, attempts: 1 }]);
});

test("[M0-7] rejects invalid payloads before invoking the job handler", async () => {
  const processed: string[] = [];
  const job = defineJob(z.strictObject({ orderId: z.string() }), ({ orderId }) => {
    processed.push(orderId);
    return Promise.resolve();
  });

  await expect(job({ orderId: 42 })).rejects.toBeInstanceOf(z.ZodError);
  expect(processed).toEqual([]);
});
