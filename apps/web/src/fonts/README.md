# Self-hosted fonts

The WOFF2 files are unmodified script subsets from the Google Fonts CSS API.
AWID type (DESIGN §4): Poppins for Latin text and numerals, IBM Plex Sans Arabic for Arabic.
The Latin layouts preload Poppins; the Arabic layout preloads the Arabic weights.

The optimized builds use Webpack because Next.js 16.4.5 emits layout-specific
font preload entries with that bundler. The Turbopack build combined both
locales' fonts in the same preload manifest.

| File                                    | Versioned source                                                                                                                          | SHA-256                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `poppins-latin-{400,500,600,700}.woff2` | [@fontsource/poppins 5.3.0](https://www.npmjs.com/package/@fontsource/poppins/v/5.3.0) `files/poppins-latin-*-normal.woff2` (SIL OFL 1.1) | see the npm tarball                                                |
| `ibm-plex-sans-arabic-400.woff2`        | [v15](https://fonts.gstatic.com/s/ibmplexsansarabic/v15/Qw3CZRtWPQCuHme67tEYUIx3Kh0PHR9N6Ys43PWrfQ.woff2)                                 | `6010e7fd0dce5d527583951750728cbe3c895efbd16aa0f809ab8c824878c9d8` |
| `ibm-plex-sans-arabic-500.woff2`        | [v15](https://fonts.gstatic.com/s/ibmplexsansarabic/v15/Qw3NZRtWPQCuHme67tEYUIx3Kh0PHR9N6YPO_-CRXMR5Kw.woff2)                             | `90aef64fea9794f232332e907d45810ab268d1a11721340025eba2a2cdb36d5c` |
| `ibm-plex-sans-arabic-600.woff2`        | [v15](https://fonts.gstatic.com/s/ibmplexsansarabic/v15/Qw3NZRtWPQCuHme67tEYUIx3Kh0PHR9N6YPi-OCRXMR5Kw.woff2)                             | `16734a5adb27b0f363e566cbbeacec480da0dc0baa19c8f0053251c2e2bc0eac` |

SIL Open Font License notices came from the Google Fonts repository at
[`86aced91de05cd4f96a06838124cca45be337b2b`](https://github.com/google/fonts/tree/86aced91de05cd4f96a06838124cca45be337b2b/ofl).
The notices are in [licenses](./licenses/) with normalized line endings and
trailing whitespace removed.
