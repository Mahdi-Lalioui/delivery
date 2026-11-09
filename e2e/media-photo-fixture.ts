import { expect, type Locator, type Page } from "@playwright/test";
import { mediaOutput } from "../packages/contracts/src/media.ts";

interface PhotoLabels {
  readonly choose: string;
  readonly cropPreview: string;
  readonly focalX: string;
  readonly zoom: string;
  readonly applyCrop: string;
  readonly selectedPreview: string;
  readonly contentMismatch: string;
}

const fixture = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAD0lEQVQImWNgYPjPwPAfAAUCAf/5sa6FAAAAAElFTkSuQmCC",
  "base64",
);

export async function rejectInvalidPhoto(page: Page, labels: PhotoLabels) {
  await page.getByLabel(labels.choose, { exact: true }).setInputFiles({
    name: "invalid.png",
    mimeType: "image/png",
    buffer: Buffer.from("not a PNG"),
  });
  await expect(page.getByText(labels.contentMismatch, { exact: true })).toBeVisible();
}

function waitForReadyMedia(page: Page, submittedId: Promise<string>) {
  return page.waitForResponse(
    async (response) => {
      if (
        response.request().method() !== "GET" ||
        !response.ok() ||
        new URL(response.url()).pathname !== `/v1/media/${await submittedId}`
      ) {
        return false;
      }
      return mediaOutput.parse(await response.json()).status === "ready";
    },
    // Allow the browser's 33-second processing window before checking rendering.
    { timeout: 35_000 },
  );
}

export async function attachPhoto(
  page: Page,
  labels: PhotoLabels,
  { save, field, buffer = fixture }: { save?: Locator; field?: Locator; buffer?: Buffer } = {},
) {
  const target = field ?? page;
  await target.getByLabel(labels.choose, { exact: true }).setInputFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer,
  });
  await expect(target.getByRole("img", { name: labels.cropPreview, exact: true })).toBeVisible();
  if (save) await expect(save).toBeDisabled();
  const focal = target.getByRole("slider", { name: labels.focalX, exact: true });
  const initialFocal = await focal.inputValue();
  await focal.press("ArrowRight");
  await expect(focal).not.toHaveValue(initialFocal);
  await target.getByRole("slider", { name: labels.zoom, exact: true }).press("ArrowRight");

  const submittedId = page
    .waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /^\/v1\/media\/[^/]+\/crop$/u.test(new URL(response.url()).pathname),
    )
    .then(async (response) => {
      expect(response.status()).toBe(202);
      return mediaOutput.parse(await response.json()).mediaId;
    });
  const [mediaId] = await Promise.all([
    submittedId,
    waitForReadyMedia(page, submittedId),
    target.getByRole("button", { name: labels.applyCrop, exact: true }).click(),
  ]);
  const ready = target.getByRole("img", { name: labels.selectedPreview, exact: true });
  await expect(ready).toBeVisible();
  await expect
    .poll(() => ready.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBeGreaterThan(0);
  return mediaId;
}
