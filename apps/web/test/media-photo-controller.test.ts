import { photoVariantWidths } from "@zaafran/contracts/media";
import { expect, test, vi } from "vitest";
import type { PhotoClient } from "../src/media/media-flow";
import type { PhotoResult } from "../src/media/media-http";
import { createPhotoController, photoPreviewUrl } from "../src/media/photo-controller";

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const mediaId = "019d6abc-1234-7234-8234-123456789002";
const reservationId = "019d6abc-1234-7234-8234-123456789009";
const identity = { mediaId, sessionId, kind: "item" } as const;
const file = new File([new Uint8Array(16)], "dish.jpg", { type: "image/jpeg" });
const variants = photoVariantWidths.flatMap((width) =>
  (["avif", "webp"] as const).map((format) => ({
    format,
    width,
    height: (width * 3) / 4,
    bytes: 1_000,
  })),
);
const awaitingCrop: PhotoResult = {
  kind: "ready",
  data: { ...identity, status: "awaiting_crop", width: 1280, height: 720 },
};
const ready: PhotoResult = {
  kind: "ready",
  data: { ...identity, status: "ready", variants, thumbhash: "AAAAAAAAAAAA" },
};

function fakeClient(overrides: Partial<PhotoClient> = {}) {
  const client: PhotoClient = {
    reservePhoto: vi.fn().mockResolvedValue(awaitingCrop),
    uploadPhotoContent: vi.fn(),
    readPhoto: vi.fn(),
    choosePhotoCrop: vi.fn().mockResolvedValue(ready),
    ...overrides,
  };
  return client;
}

function controllerWith(client: PhotoClient) {
  return createPhotoController({
    target: { kind: "item", merchantId },
    sessionId,
    client,
    wait: () => Promise.resolve(),
    newKey: () => reservationId,
  });
}

async function waitFor(controller: ReturnType<typeof createPhotoController>, kind: string) {
  await vi.waitFor(() => {
    expect(controller.getSnapshot().kind).toBe(kind);
  });
}

test("[MER-14:hook] uploads, opens the cropper, then saves the adjusted crop", async () => {
  const client = fakeClient();
  const controller = controllerWith(client);
  const listener = vi.fn();
  const unsubscribe = controller.subscribe(listener);
  controller.confirm();
  expect(client.choosePhotoCrop).not.toHaveBeenCalled();
  controller.choose(file);
  expect(controller.getSnapshot().kind).toBe("uploading");
  await waitFor(controller, "cropping");
  expect(client.reservePhoto).toHaveBeenCalledWith(
    expect.objectContaining({
      input: { kind: "item", merchantId, contentType: "image/jpeg", bytes: 16 },
      sessionId,
      idempotencyKey: reservationId,
    }),
  );
  const moved = { focalX: 2_500, focalY: 5_000, zoomPercent: 120 };
  controller.adjust(moved);
  controller.confirm();
  controller.confirm();
  await waitFor(controller, "ready");
  expect(client.choosePhotoCrop).toHaveBeenCalledOnce();
  expect(client.choosePhotoCrop).toHaveBeenCalledWith(
    expect.objectContaining({ mediaId, sessionId, crop: moved }),
  );
  expect(listener).toHaveBeenCalled();
  unsubscribe();
  controller.dispose();
});

test("[MER-14:hook] reset during an upload aborts it and ignores the late result", async () => {
  const late = Promise.withResolvers<PhotoResult>();
  const reservePhoto = vi.fn<(request: { signal: AbortSignal }) => Promise<PhotoResult>>(
    () => late.promise,
  );
  const controller = controllerWith(fakeClient({ reservePhoto }));
  controller.choose(file);
  controller.reset();
  expect(reservePhoto.mock.calls.at(0)?.[0].signal.aborted).toBe(true);
  late.resolve(awaitingCrop);
  await Promise.resolve();
  await Promise.resolve();
  expect(controller.getSnapshot()).toEqual({ kind: "idle" });
});

test("[MER-14:hook] dispose aborts the crop save in flight", async () => {
  const pending = Promise.withResolvers<PhotoResult>();
  const choosePhotoCrop = vi.fn<(request: { signal: AbortSignal }) => Promise<PhotoResult>>(
    () => pending.promise,
  );
  const controller = controllerWith(fakeClient({ choosePhotoCrop }));
  controller.choose(file);
  await waitFor(controller, "cropping");
  controller.confirm();
  expect(controller.getSnapshot().kind).toBe("saving");
  controller.dispose();
  expect(choosePhotoCrop.mock.calls.at(0)?.[0].signal.aborted).toBe(true);
});

test("[MER-14:hook] a refused file never reaches the network", async () => {
  const client = fakeClient();
  const controller = controllerWith(client);
  controller.choose(new File(["x"], "menu.gif", { type: "image/gif" }));
  await waitFor(controller, "idle");
  expect(controller.getSnapshot()).toEqual({
    kind: "idle",
    failure: { kind: "unsupported-type" },
  });
  expect(client.reservePhoto).not.toHaveBeenCalled();
});

test("[MER-14:hook] reads the private preview from the photo's own path", () => {
  expect(photoPreviewUrl(mediaId)).toBe(`/v1/media/${mediaId}/preview`);
});
