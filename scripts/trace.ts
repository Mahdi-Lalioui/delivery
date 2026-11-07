import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { acceptanceOwnership } from "./acceptance-ownership.ts";
import { resolveGate } from "./gate-plan.ts";
import { findAcceptanceFiles } from "./trace-files.ts";
import { checkTrace, getSpecIds, getTitleIds } from "./trace-spec.ts";

const workspace = fileURLToPath(new URL("../", import.meta.url));

function getTraceScope(args: readonly string[]): number {
  if (args.length === 1 && args[0] === "--all") return 12;
  if (args.length === 2 && args[0] === "--through" && args[1]) {
    return Number(resolveGate(args[1]).slice(1));
  }
  if (args.length > 0) throw new Error("Usage: pnpm trace [--through mN | --all]");
  const progress = readFileSync(new URL("../docs/PROGRESS.md", import.meta.url), "utf8");
  const milestone = progress.match(/^- Milestone: M(\d+)\b/m)?.[1];
  const current = process.env.TRACE_MILESTONE ?? (milestone ? "m" + milestone : "");
  return Number(resolveGate(current).slice(1));
}

function listTitleIds(): string[] {
  const files = findAcceptanceFiles(workspace);
  return files.flatMap((path) => getTitleIds(readFileSync(resolve(workspace, path), "utf8"), path));
}

try {
  const specIds = getSpecIds(readFileSync(new URL("../docs/SPEC.md", import.meta.url), "utf8"));
  const through = getTraceScope(process.argv.slice(2));
  const { missing, pending } = checkTrace({
    specIds,
    titleIds: listTitleIds(),
    ownership: acceptanceOwnership,
    through,
  });
  const required = specIds.length - pending.length;
  process.stdout.write(
    `Trace through m${String(through)}: ${String(required - missing.length)}/${String(required)} required IDs covered.\n`,
  );
  if (pending.length)
    process.stdout.write(`Future IDs (${String(pending.length)}): ${pending.join(", ")}\n`);
  if (missing.length)
    process.stderr.write("Missing acceptance tests: " + missing.join(", ") + "\n");
  process.exitCode = missing.length ? 1 : 0;
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
}
