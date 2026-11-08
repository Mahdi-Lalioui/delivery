import qrcode from "qrcode-generator";
import { expect, test } from "vitest";
import { qrSvgPath, shareUrl } from "../src/retention/qr";

test("[MER-24] encodes the link as QR modules drawn as one SVG path", () => {
  const url = "https://zaafran.example/r/019d6abc-0000-7000-8000-000000000002";
  const { size, path } = qrSvgPath(url);
  const reference = qrcode(0, "M");
  reference.addData(url);
  reference.make();
  expect(size).toBe(reference.getModuleCount());
  const darkCount = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => reference.isDark(row, col)),
  )
    .flat()
    .filter(Boolean).length;
  expect(path.match(/M/g)).toHaveLength(darkCount);
  expect(path.startsWith("M0 0h1v1h-1z")).toBe(true);
});

test("[MER-24] builds the short public link from the origin and merchant id", () => {
  expect(shareUrl("https://zaafran.example/", "019D6ABC-0000-7000-8000-000000000002")).toBe(
    "https://zaafran.example/r/019d6abc-0000-7000-8000-000000000002",
  );
});
