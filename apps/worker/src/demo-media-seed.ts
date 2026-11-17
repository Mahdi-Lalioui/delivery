import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { DatabaseConnection } from "@zaafran/db/database";
import {
  acceptDemoCrop,
  attachDemoItemPhoto,
  insertDemoPhotoUpload,
  listDemoItemsWithoutPhoto,
} from "@zaafran/db/demo-media";
import type { DemoItem } from "@zaafran/db/demo-media";
import type { MediaStore } from "@zaafran/media";
import { createNameOutliner, readDemoFont } from "./demo-name-outline.js";
import { renderDemoPlaceholder } from "./demo-placeholder.js";
import { createMediaProcessor } from "./media-process.js";

interface DemoMediaOptions {
  readonly database: DatabaseConnection;
  readonly store: MediaStore;
  readonly maxPixels: number;
  readonly now: Date;
}

type Processor = ReturnType<typeof createMediaProcessor>;

async function putOriginal(store: MediaStore, data: Buffer): Promise<string> {
  const key = `quarantine/${randomUUID()}/demo.png`;
  const checksumSha256 = createHash("sha256").update(data).digest("base64");
  await store.put({ key, body: Readable.from([data]), bytes: data.length, checksumSha256 });
  return key;
}

async function publishDemoPhoto(
  options: DemoMediaOptions,
  processMedia: Processor,
  { item, png }: { item: DemoItem; png: Buffer },
): Promise<boolean> {
  const { database, store, now } = options;
  const quarantineKey = await putOriginal(store, png);
  const digest = createHash("sha256").update(png).digest();
  const mediaId = await insertDemoPhotoUpload(database, {
    merchantId: item.merchantId,
    quarantineKey,
    bytes: png.length,
    digest,
    now,
  });
  await processMedia({ mediaId, phase: "prepare" });
  if (!(await acceptDemoCrop(database, mediaId))) return false;
  await processMedia({ mediaId, phase: "publish" });
  return attachDemoItemPhoto(database, { itemId: item.itemId, mediaId });
}

/** D-023: draws and publishes a placeholder for each demo dish without a photo; returns the count. */
export async function seedDemoMedia(options: DemoMediaOptions): Promise<number> {
  const { database, store, maxPixels } = options;
  const outline = createNameOutliner(await readDemoFont());
  const processMedia = createMediaProcessor({ database, store, maxPixels });
  let attached = 0;
  for (const item of await listDemoItemsWithoutPhoto(database)) {
    const png = await renderDemoPlaceholder(item, outline);
    if (await publishDemoPhoto(options, processMedia, { item, png })) attached += 1;
  }
  return attached;
}
