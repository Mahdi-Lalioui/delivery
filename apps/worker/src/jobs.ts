import type { z } from "zod";

export function defineJob<Schema extends z.ZodType>(
  schema: Schema,
  handler: (payload: z.output<Schema>) => Promise<void>,
) {
  return async (input: unknown): Promise<void> => {
    await handler(await schema.parseAsync(input));
  };
}
