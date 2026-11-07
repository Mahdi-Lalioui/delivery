import localFont from "next/font/local";

const notoNaskhArabic = localFont({
  src: "./noto-naskh-arabic-600-700.woff2",
  weight: "600 700",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  variable: "--font-noto-naskh-arabic",
  declarations: [
    {
      prop: "unicode-range",
      value: "U+0600-08FF, U+200C-200E, U+2010-2011, U+FB50-FDFF, U+FE70-FEFF, U+1EE00-1EEFF",
    },
  ],
});

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

export const arabicFonts = `${notoNaskhArabic.variable} ${ibmPlexSansArabic.variable}`;
