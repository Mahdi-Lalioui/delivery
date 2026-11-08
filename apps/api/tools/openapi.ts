import { readFile, writeFile } from "node:fs/promises";
import { createApi } from "../src/app.ts";

const target = new URL("../../../docs/openapi.json", import.meta.url);
const api = createApi({ checkReadiness: () => Promise.resolve() });

try {
  await api.ready();
  const generated = JSON.stringify(api.swagger(), null, 2) + "\n";
  if (process.argv[2] === "--check") {
    if ((await readFile(target, "utf8")) !== generated) {
      throw new Error("The OpenAPI document is stale. Run pnpm --filter @zaafran/api openapi.");
    }
  } else {
    await writeFile(target, generated);
  }
} finally {
  await api.close();
}
