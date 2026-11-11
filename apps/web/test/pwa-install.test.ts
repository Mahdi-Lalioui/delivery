import { expect, test } from "vitest";
import { GET as manifest } from "../src/app/pwa/[locale]/app.webmanifest/route";
import { GET as offline } from "../src/app/pwa/[locale]/offline/route";
import { decodeKey } from "../src/tracking/push-http";

const params = (locale: string) => ({ params: Promise.resolve({ locale }) });

test("[CUS-25] the manifest carries the AWID name, colours, icons and shortcuts", async () => {
  const response = await manifest(new Request("http://web.test"), params("ar"));
  const body = await response.text();
  for (const fragment of [
    '"name":"أويد"',
    '"theme_color":"#0B3D2E"',
    '"background_color":"#FFFCF5"',
    '"start_url":"/ar/discover"',
    '"dir":"rtl"',
    '"src":"/pwa/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any"',
    '"src":"/pwa/icon-maskable-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"',
    '"url":"/ar/orders"',
  ]) {
    expect(body).toContain(fragment);
  }
  expect((await manifest(new Request("http://web.test"), params("xx"))).status).toBe(404);
});

test("[CUS-25] the offline page shows the AWID icon and a way back", async () => {
  const html = await (await offline(new Request("http://web.test"), params("fr"))).text();
  expect(html).toContain('src="/brand/awid-icon.svg"');
  expect(html).toContain('href="/fr/discover"');
  expect(html).toContain("Vous êtes hors ligne");
});

test("[CUS-20] decodes a base64url VAPID key into its raw bytes", () => {
  const key =
    "BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8";
  const bytes = decodeKey(key);
  expect(bytes).toHaveLength(65);
  expect(bytes[0]).toBe(4);
  expect(bytes[64]).toBe(15);
  expect(Array.from(decodeKey("-_8"))).toEqual([251, 255]);
});
