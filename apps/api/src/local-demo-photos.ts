import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { createLocalMediaStore, cropPhoto } from "@zaafran/media";

const cuisines = ["algerian", "pizza", "grill", "bakery"] as const;
const kinds = ["cover", "logo"] as const;

export async function publishLocalDemoPhotos(root: string) {
  const store = createLocalMediaStore({ root });
  const assets = [];
  for (const cuisine of cuisines) {
    const original = await readFile(
      new URL(`../../../packages/db/fixtures/demo-menu/${cuisine}.png`, import.meta.url),
    );
    for (const kind of kinds) {
      const crop = await cropPhoto({
        bytes: original,
        contentType: "image/png",
        kind,
        crop: { focalX: 5000, focalY: 5000, zoomPercent: kind === "logo" ? 160 : 100 },
      });
      if (crop.status !== "cropped") throw new Error(`Cannot crop demo ${cuisine} ${kind}.`);
      const variants = [];
      for (const { format, width, height, bytes } of crop.variants) {
        const digest = createHash("sha256").update(bytes).digest();
        const key = `local-tour/${cuisine}/${kind}/${digest.toString("hex")}.${format}`;
        await store.put({
          key,
          body: Readable.from(bytes),
          bytes: bytes.length,
          checksumSha256: digest.toString("base64"),
        });
        variants.push({ key, format, width, height, bytes: bytes.length });
      }
      assets.push({ cuisine, kind, thumbhash: crop.thumbhash, variants });
    }
  }
  return assets;
}
