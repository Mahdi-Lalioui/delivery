import { expect, test } from "vitest";
import { photoStateAfterMount } from "../src/menu-preview/use-photo-fade";

test("[MER-14] hides only a photo still loading after hydration so it can fade in", () => {
  expect(photoStateAfterMount(false)).toBe("loading");
  expect(photoStateAfterMount(true)).toBe("settled");
});
