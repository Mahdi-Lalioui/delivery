import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, unlink, type FileHandle } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { type MediaPut, type MediaStore, validLength, validateKey, validatePut } from "./store.js";

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function removeFile(path: string): Promise<boolean> {
  try {
    await unlink(path);
    return true;
  } catch (error) {
    if (hasCode(error, "ENOENT")) return false;
    throw error;
  }
}

async function syncDirectory(path: string): Promise<void> {
  const directory = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

async function writeChecked(file: FileHandle, input: MediaPut): Promise<void> {
  const hash = createHash("sha256");
  let size = 0;
  for await (const value of input.body) {
    const chunk: unknown = value;
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError("Media upload must stream bytes");
    }
    if (chunk.byteLength > input.bytes - size) {
      throw new Error("Media object length mismatch");
    }
    size += chunk.byteLength;
    hash.update(chunk);
    await file.writeFile(chunk);
  }
  if (size !== input.bytes) throw new Error("Media object length mismatch");
  if (hash.digest("base64") !== input.checksumSha256) throw new Error("Media checksum mismatch");
  await file.sync();
}

export function createLocalMediaStore(options: { root: string }): MediaStore {
  if (!isAbsolute(options.root)) throw new TypeError("Media store root must be an absolute path");
  const root = resolve(options.root);

  async function objectPath(key: string): Promise<string> {
    validateKey(key);
    await mkdir(root, { recursive: true, mode: 0o700 });
    const directory = await lstat(root);
    if (!directory.isDirectory() || (directory.mode & 0o077) !== 0) {
      throw new Error("Media store root must be a private directory");
    }
    return join(root, createHash("sha256").update(key).digest("hex"));
  }

  return {
    async put(input) {
      validatePut(input);
      const path = await objectPath(input.key);
      const temporary = join(root, `.${randomUUID()}.tmp`);
      const file = await open(temporary, "wx", 0o600);
      let result: "stored" | "exists" = "stored";

      try {
        await writeChecked(file, input);
        try {
          await link(temporary, path);
        } catch (error) {
          if (!hasCode(error, "EEXIST")) throw error;
          result = "exists";
        }
      } finally {
        try {
          await file.close();
        } finally {
          await removeFile(temporary);
        }
      }
      await syncDirectory(root);
      return result;
    },

    async get(key) {
      const path = await objectPath(key);
      let file;
      try {
        file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      } catch (error) {
        if (hasCode(error, "ENOENT")) return undefined;
        throw error;
      }

      try {
        const info = await file.stat();
        if (!info.isFile() || !validLength(info.size)) throw new Error("Invalid media object file");
        return { body: file.createReadStream(), bytes: info.size };
      } catch (error) {
        await file.close();
        throw error;
      }
    },

    async delete(key) {
      if (await removeFile(await objectPath(key))) await syncDirectory(root);
    },
  };
}
