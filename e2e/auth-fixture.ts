import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";

type Bootstrap = { startAuthHarness(webOrigin: string): Promise<AuthHarness> };

function isBootstrap(module: unknown): module is Bootstrap {
  return (
    typeof module === "object" &&
    module !== null &&
    "startAuthHarness" in module &&
    typeof module.startAuthHarness === "function"
  );
}

// Keep the Drizzle driver and API declarations in the API workspace's TypeScript project.
const bootstrapUrl = new URL("../apps/api/tools/e2e-auth-bootstrap.ts", import.meta.url);

export async function withAuthHarness(
  baseURL: string | undefined,
  use: (harness: AuthHarness) => Promise<void>,
): Promise<void> {
  if (baseURL === undefined) throw new Error("Run browser authentication with e2e/auth.config.ts.");
  const bootstrap: unknown = await import(bootstrapUrl.href);
  if (!isBootstrap(bootstrap)) throw new Error("Missing authentication test bootstrap.");
  const harness = await bootstrap.startAuthHarness(baseURL);
  try {
    await use(harness);
  } finally {
    await harness.close();
  }
}

type MediaWorkerTool = {
  startMediaWorker(options: { databaseUrl: string; storageRoot: string }): Promise<{
    close(): Promise<void>;
  }>;
  syntheticJpeg: () => Promise<Buffer>;
};

function isMediaWorkerTool(module: unknown): module is MediaWorkerTool {
  return (
    typeof module === "object" &&
    module !== null &&
    "startMediaWorker" in module &&
    typeof module.startMediaWorker === "function" &&
    "syntheticJpeg" in module &&
    typeof module.syntheticJpeg === "function"
  );
}

// Keep Sharp and Graphile Worker in the worker workspace's TypeScript project.
const mediaWorkerUrl = new URL("../apps/worker/tools/e2e-media-worker.ts", import.meta.url);

/** Runs the compiled media worker on the harness database and store for a photo journey. */
export async function withMediaWorker(
  harness: AuthHarness,
  use: (photo: { syntheticJpeg: () => Promise<Buffer> }) => Promise<void>,
): Promise<void> {
  const tool: unknown = await import(mediaWorkerUrl.href);
  if (!isMediaWorkerTool(tool)) throw new Error("Missing media worker test tool.");
  const worker = await tool.startMediaWorker({
    databaseUrl: harness.databaseUrl,
    storageRoot: harness.mediaRoot,
  });
  try {
    await use({ syntheticJpeg: tool.syntheticJpeg });
  } finally {
    await worker.close();
  }
}
