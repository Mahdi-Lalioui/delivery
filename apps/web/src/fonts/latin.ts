import localFont from "next/font/local";

const fraunces = localFont({
  src: "./fraunces-latin-600.woff2",
  weight: "600",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
  variable: "--font-fraunces",
  declarations: [{ prop: "unicode-range", value: "U+0000-024F, U+02B0-036F, U+2000-206F" }],
});

const inter = localFont({
  src: "./inter-latin.woff2",
  weight: "400 600",
  display: "swap",
  variable: "--font-inter",
  declarations: [{ prop: "unicode-range", value: "U+0000-024F, U+02B0-036F, U+2000-206F" }],
});

export const latinFonts = `${fraunces.variable} ${inter.variable}`;
