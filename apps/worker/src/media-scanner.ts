import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

export type ScanMedia = (bytes: Buffer) => Promise<boolean>;

const run = promisify(execFile);

export function createClamScan(executable: string, database?: string): ScanMedia {
  return async (bytes) => {
    const directory = await mkdtemp(join(tmpdir(), "awid-scan-"));
    try {
      const original = join(directory, "original");
      await writeFile(original, bytes, { mode: 0o600 });
      const verdict = await run(
        executable,
        [
          "--no-summary",
          "--stdout",
          "--alert-exceeds-max=yes",
          ...(database ? ["--database=" + database, "--fail-if-cvd-older-than=3"] : []),
          original,
        ],
        {
          timeout: 30_000,
          maxBuffer: 16_384,
        },
      ).then(
        () => "clean",
        (error: unknown) =>
          typeof error === "object" && error !== null && "code" in error && error.code === 1
            ? "flagged"
            : "unavailable",
      );
      if (verdict === "unavailable") throw new Error("Media scanner unavailable");
      return verdict === "clean";
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
}
