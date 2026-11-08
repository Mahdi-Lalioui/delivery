import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export const photoMaximumPixels = 24 * 1024 * 1024;

export interface DecodedRgba {
  bytes: Buffer;
  width: number;
  height: number;
}

const dimensionsBytes = 8;
const rgbaChannels = 4;
const maximumOutputBytes = dimensionsBytes + photoMaximumPixels * rgbaChannels;

function readPixels(stdout: Buffer): DecodedRgba {
  if (stdout.length < dimensionsBytes) throw new Error("HEIC decoder returned a short header");
  const width = stdout.readUInt32LE(0);
  const height = stdout.readUInt32LE(4);
  if (width === 0 || height === 0 || width > Math.floor(photoMaximumPixels / height)) {
    throw new Error("HEIC decoder returned invalid dimensions");
  }
  if (stdout.length !== dimensionsBytes + width * height * rgbaChannels) {
    throw new Error("HEIC decoder returned an invalid pixel payload");
  }
  return { width, height, bytes: stdout.subarray(dimensionsBytes) };
}

function runDecoder(executable: string, input: string): Promise<Buffer | undefined> {
  return new Promise((resolveOutput, reject) => {
    execFile(
      executable,
      [input],
      {
        encoding: "buffer",
        env: {},
        killSignal: "SIGKILL",
        maxBuffer: maximumOutputBytes,
        timeout: 10_000,
      },
      (error, stdout) => {
        if (!error) resolveOutput(stdout);
        else if (error.code === 1) resolveOutput(undefined);
        // The process error message may contain the private input path.
        else
          reject(
            new Error("HEIC decoder failed", { cause: { code: error.code, signal: error.signal } }),
          );
      },
    );
  });
}

export async function decodeHeic(
  bytes: Buffer,
  executable?: string,
): Promise<DecodedRgba | undefined> {
  if (!executable || !isAbsolute(executable)) {
    throw new Error("An absolute HEIC decoder path is required");
  }

  const directory = await mkdtemp(resolve(tmpdir(), "zaafran-heic-"));
  try {
    const input = join(directory, "photo.heic");
    await writeFile(input, bytes, { mode: 0o600, flag: "wx" });
    const stdout = await runDecoder(executable, input);
    return stdout === undefined ? undefined : readPixels(stdout);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
