import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { pushPublicKey } from "@zaafran/contracts/push";
import { workerLogger } from "./logger.js";

export function defaultMediaStorageRoot(): string {
  return join(tmpdir(), "zaafran-media");
}

const workerEnvironment = z
  .object({
    DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
    MEDIA_STORAGE_ROOT: z.string().refine(isAbsolute).default(defaultMediaStorageRoot),
    HEIC_DECODER_PATH: z.string().refine(isAbsolute).optional(),
    ORDER_SMS_WEBHOOK_URL: z
      .url({ protocol: /^https$/u })
      .refine((value) => {
        const url = URL.parse(value);
        return url !== null && !url.username && !url.password && !url.hash;
      })
      .optional(),
    ORDER_SMS_WEBHOOK_TOKEN: z
      .string()
      .min(1)
      .max(2048)
      .regex(/^[!-~]+$/u)
      .optional(),
    VAPID_PUBLIC_KEY: pushPublicKey.optional(),
    VAPID_PRIVATE_KEY: z
      .string()
      .regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u)
      .optional(),
    VAPID_SUBJECT: z.url({ protocol: /^(mailto|https)$/u }).optional(),
  })
  .refine(
    ({ ORDER_SMS_WEBHOOK_URL, ORDER_SMS_WEBHOOK_TOKEN }) =>
      Boolean(ORDER_SMS_WEBHOOK_URL) === Boolean(ORDER_SMS_WEBHOOK_TOKEN),
    {
      path: ["ORDER_SMS_WEBHOOK_URL"],
      message: "Set both SMS webhook variables or omit both.",
    },
  )
  .refine(
    ({ VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT }) => {
      const count = [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT].filter(Boolean).length;
      return count === 0 || count === 3;
    },
    { path: ["VAPID_PUBLIC_KEY"], message: "Set all VAPID variables or omit all three." },
  );

export async function runWorkerCommand(
  command: "start" | "migrate",
  execute: (environment: z.output<typeof workerEnvironment>) => Promise<void>,
): Promise<void> {
  const environment = workerEnvironment.safeParse(process.env);
  if (!environment.success) {
    const variables = environment.error.issues.map(({ path }) => path.join("."));
    workerLogger.error({ command, variables }, "Invalid worker configuration");
    process.exitCode = 1;
    return;
  }

  try {
    await execute(environment.data);
  } catch {
    workerLogger.error({ command }, "Worker command failed");
    process.exitCode = 1;
  }
}
