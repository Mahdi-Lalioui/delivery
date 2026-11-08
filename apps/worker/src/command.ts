import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { workerLogger } from "./logger.js";

export function defaultMediaStorageRoot(): string {
  return join(tmpdir(), "zaafran-media");
}

const workerEnvironment = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
  MEDIA_STORAGE_ROOT: z.string().refine(isAbsolute).default(defaultMediaStorageRoot),
  HEIC_DECODER_PATH: z.string().refine(isAbsolute).optional(),
});

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
