import { z } from "./schema.js";

export const healthResponseSchema = z.strictObject({ status: z.literal("ok") });
export const readyResponseSchema = z.strictObject({ status: z.literal("ready") });
export const requestIdSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);

export const problemResponseSchema = z.strictObject({
  type: z.url(),
  title: z.string().min(1),
  status: z.int().min(400).max(599),
  code: z.string().regex(/^[a-z][a-z0-9_]*$/),
  requestId: requestIdSchema,
  detail: z.string().min(1).optional(),
});
