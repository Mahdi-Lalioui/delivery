import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { workerLogger } from "./logger.js";

const workerEnvironment = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
  MEDIA_STORAGE_ROOT: z
    .string()
    .refine(isAbsolute, "Media storage root must be an absolute path")
    .default(() => join(tmpdir(), "zaafran-media")),
  MEDIA_MAX_DECODED_PIXELS: z
    .string()
    .regex(/^\d{1,9}$/)
    .transform(Number)
    .pipe(z.int().min(1).max(100_000_000))
    .default(50_000_000),
});

export type WorkerEnvironment = z.output<typeof workerEnvironment>;

export function readWorkerEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): WorkerEnvironment | undefined {
  const result = workerEnvironment.safeParse(environment);
  return result.success ? result.data : undefined;
}

export async function runWorkerCommand(
  command: "start" | "migrate",
  execute: (environment: WorkerEnvironment) => Promise<void>,
): Promise<void> {
  const environment = readWorkerEnvironment(process.env);
  if (!environment) {
    workerLogger.error({ command }, "The worker environment is invalid");
    process.exitCode = 1;
    return;
  }

  try {
    await execute(environment);
  } catch {
    workerLogger.error({ command }, "Worker command failed");
    process.exitCode = 1;
  }
}
