import { z } from "zod";

export const pageLimit = z
  .string()
  .regex(/^[0-9]{1,3}$/)
  .transform(Number)
  .pipe(z.int().min(1).max(100))
  .default(50);
