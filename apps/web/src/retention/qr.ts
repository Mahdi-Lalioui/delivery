import qrcode from "qrcode-generator";

// MER-24 QR codes. qrcode-generator (MIT, no dependencies) builds the modules; we draw them as a
// single SVG path so the poster prints sharply at any size.

/** One `M x y h1 v1 h-1 z` square per dark module, in a viewBox of `size × size`. */
export function qrSvgPath(text: string): { size: number; path: string } {
  const code = qrcode(0, "M");
  code.addData(text);
  code.make();
  const size = code.getModuleCount();
  const squares: string[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (code.isDark(row, col)) squares.push(`M${String(col)} ${String(row)}h1v1h-1z`);
    }
  }
  return { size, path: squares.join("") };
}

/** The short public link printed on posters; lane A redirects `/r/:merchantId` to the menu. */
export function shareUrl(origin: string, merchantId: string): string {
  return new URL(`/r/${merchantId.toLowerCase()}`, origin).toString();
}
