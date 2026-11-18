import localFont from "next/font/local";

// AWID Arabic: IBM Plex Sans Arabic for text and headlines; Poppins for Latin words and numerals.
const ibmPlexSansArabic = localFont({
  src: [
    { path: "./ibm-plex-sans-arabic-400.woff2", weight: "400" },
    { path: "./ibm-plex-sans-arabic-500.woff2", weight: "500" },
    { path: "./ibm-plex-sans-arabic-600.woff2", weight: "600" },
  ],
  display: "swap",
  adjustFontFallback: false,
  variable: "--font-ibm-plex-sans-arabic",
  declarations: [
    {
      prop: "unicode-range",
      value: "U+0600-08FF, U+200C-200E, U+2010-2011, U+FB50-FDFF, U+FE70-FEFF, U+1EE00-1EEFF",
    },
  ],
});

const poppinsLatin = localFont({
  src: [
    { path: "./poppins-latin-500.woff2", weight: "500" },
    { path: "./poppins-latin-600.woff2", weight: "600" },
  ],
  display: "swap",
  preload: false,
  variable: "--font-poppins",
  declarations: [{ prop: "unicode-range", value: "U+0000-024F, U+2000-206F" }],
});

// Dar Zellige display face for Arabic headlines: El Messiri (SIL OFL), with Fraunces for Latin
// words inside them (restaurant names).
const elMessiri = localFont({
  src: [
    { path: "./el-messiri-arabic-600.woff2", weight: "600" },
    { path: "./el-messiri-arabic-700.woff2", weight: "700" },
  ],
  display: "swap",
  adjustFontFallback: false,
  variable: "--font-el-messiri",
  declarations: [
    {
      prop: "unicode-range",
      value: "U+0600-08FF, U+200C-200E, U+2010-2011, U+FB50-FDFF, U+FE70-FEFF",
    },
  ],
});

const frauncesLatin = localFont({
  src: [{ path: "./fraunces-latin-700.woff2", weight: "700" }],
  display: "swap",
  preload: false,
  variable: "--font-fraunces",
  declarations: [{ prop: "unicode-range", value: "U+0000-024F, U+2000-206F" }],
});

export const arabicFonts = `${ibmPlexSansArabic.variable} ${poppinsLatin.variable} ${elMessiri.variable} ${frauncesLatin.variable}`;
