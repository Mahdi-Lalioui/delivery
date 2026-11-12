import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { cropPhoto, type MediaStore } from "@zaafran/media";
import type { DemoMenu } from "./demo-seed-menu.ts";

export interface DemoPhoto {
  readonly kind: "item" | "cover";
  readonly bytes: number;
  readonly digest: Buffer;
  readonly thumbhash: string;
  readonly variants: readonly {
    readonly key: string;
    readonly format: "avif" | "webp";
    readonly width: number;
    readonly height: number;
    readonly bytes: number;
  }[];
}

export async function publishDemoPhoto(
  store: MediaStore,
  menu: DemoMenu,
  kind: DemoPhoto["kind"],
): Promise<DemoPhoto> {
  // Original synthetic illustrations are 640×480 PNGs kept with the seed.
  const original = await readFile(new URL(`../fixtures/demo-menu/${menu}.png`, import.meta.url));
  const crop = await cropPhoto({
    bytes: original,
    contentType: "image/png",
    kind,
    crop: { focalX: 5000, focalY: 5000, zoomPercent: 100 },
  });
  if (crop.status !== "cropped") throw new Error(`Invalid demo menu image: ${menu}.`);

  const variants = [];
  for (const { format, width, height, bytes } of crop.variants) {
    const digest = createHash("sha256").update(bytes).digest();
    const directory = kind === "item" ? menu : `cover/${menu}`;
    const key = `demo-menu-v1/${directory}/${format}-${String(width)}-${digest.toString("hex")}`;
    await store.put({
      key,
      body: Readable.from(bytes),
      bytes: bytes.length,
      checksumSha256: digest.toString("base64"),
    });
    variants.push({ key, format, width, height, bytes: bytes.length });
  }
  return {
    kind,
    bytes: original.length,
    digest: createHash("sha256").update(original).digest(),
    thumbhash: crop.thumbhash,
    variants,
  };
}
