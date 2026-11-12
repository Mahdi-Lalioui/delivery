import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";

type Bootstrap = {
  startAuthHarness(
    webOrigin: string,
    withMediaWorker?: boolean,
    protocol?: "http" | "https",
  ): Promise<AuthHarness>;
};

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
  options: boolean | { protocol: "http" | "https" } = false,
): Promise<void> {
  if (baseURL === undefined) throw new Error("Run browser authentication with e2e/auth.config.ts.");
  const bootstrap: unknown = await import(bootstrapUrl.href);
  if (!isBootstrap(bootstrap)) throw new Error("Missing authentication test bootstrap.");
  const harness =
    typeof options === "boolean"
      ? await bootstrap.startAuthHarness(baseURL, options)
      : await bootstrap.startAuthHarness(baseURL, false, options.protocol);
  try {
    await use(harness);
  } finally {
    await harness.close();
  }
}
