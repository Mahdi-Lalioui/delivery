import { z } from "zod";

const apiEnvironment = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z
    .string()
    .regex(/^\d{1,5}$/)
    .transform(Number)
    .pipe(z.int().max(65_535))
    .default(3002),
});

export function readApiEnvironment(environment: Readonly<Record<string, string | undefined>>) {
  return apiEnvironment.parse(environment);
}
