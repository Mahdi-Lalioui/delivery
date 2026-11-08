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

export async function attachPhoto(page: Page, labels: PhotoLabels, save?: Locator) {
  await page.getByLabel(labels.choose, { exact: true }).setInputFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: fixture,
  });
  await expect(page.getByRole("img", { name: labels.cropPreview, exact: true })).toBeVisible();
  if (save) await expect(save).toBeDisabled();
  const focal = page.getByRole("slider", { name: labels.focalX, exact: true });
  const initialFocal = await focal.inputValue();
  await focal.press("ArrowRight");
  await expect(focal).not.toHaveValue(initialFocal);
  await page.getByRole("slider", { name: labels.zoom, exact: true }).press("ArrowRight");

  const crop = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/v1\/media\/[^/]+\/crop$/u.test(new URL(response.url()).pathname),
  );
  await page.getByRole("button", { name: labels.applyCrop, exact: true }).click();
  const response = await crop;
  expect(response.status()).toBe(202);
  const submitted = mediaOutput.parse(await response.json());
  const ready = page.getByRole("img", { name: labels.selectedPreview, exact: true });
  await expect(ready).toBeVisible();
  await expect
    .poll(() => ready.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBeGreaterThan(0);
  return submitted.mediaId;
}
