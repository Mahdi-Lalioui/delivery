import localFont from "next/font/local";

// AWID type: Poppins for headlines, UI and tabular prices (SIL OFL, self-hosted).
const poppins = localFont({
  src: [
    { path: "./poppins-latin-400.woff2", weight: "400" },
    { path: "./poppins-latin-500.woff2", weight: "500" },
    { path: "./poppins-latin-600.woff2", weight: "600" },
    { path: "./poppins-latin-700.woff2", weight: "700" },
  ],
  display: "swap",
  adjustFontFallback: "Arial",
  variable: "--font-poppins",
  declarations: [{ prop: "unicode-range", value: "U+0000-024F, U+02B0-036F, U+2000-206F, U+20AC" }],
});

export const latinFonts = poppins.variable;
