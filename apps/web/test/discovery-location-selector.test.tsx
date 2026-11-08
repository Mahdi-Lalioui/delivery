import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { DiscoveryLocationSelector } from "../src/discovery/discovery-location-selector";

test("[CUS-02] the first visit offers an Arabic delivery location prompt", () => {
  const html = renderToStaticMarkup(<DiscoveryLocationSelector locale="ar" />);
  expect(html).toMatch(/<button[^>]+aria-haspopup="dialog"[^>]*>/);
  expect(html).toContain("اختيار عنوان");
  expect(html).toContain("أين تريد استلام طلبك؟");
});
