import { globSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  browserTestPattern,
  integrationTestPatterns,
  unitTestPatterns,
} from "@zaafran/config/test-patterns";

export function findAcceptanceFiles(workspace: string): string[] {
  const unit = globSync(unitTestPatterns.include, {
    cwd: workspace,
    exclude: unitTestPatterns.exclude,
  });
  const integration = globSync(integrationTestPatterns.include, {
    cwd: workspace,
    exclude: integrationTestPatterns.exclude,
  });
  const browser = globSync(browserTestPattern, {
    cwd: resolve(workspace, "e2e"),
    exclude: ["**/node_modules/**"],
  });
  return [...new Set([...unit, ...integration, ...browser.map((file) => join("e2e", file))])];
}
