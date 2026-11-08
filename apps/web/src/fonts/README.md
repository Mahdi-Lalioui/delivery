# Self-hosted fonts

The WOFF2 files are unmodified script subsets from the Google Fonts CSS API.
The Latin layouts preload Inter. The Arabic layout preloads the Arabic UI weights.
The display fonts load on demand with `font-display: swap`.

The optimized builds use Webpack because Next.js 16.4.5 emits layout-specific
font preload entries with that bundler. The Turbopack build combined both
locales' fonts in the same preload manifest.

| File                              | Versioned source                                                                                                                  | SHA-256                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `fraunces-latin-600.woff2`        | [v38](https://fonts.gstatic.com/s/fraunces/v38/6NUu8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0K7iN7iQcIfJD58njt0oc7qv8.woff2) | `170a928c701ef00e4b91105f870dd2c764b9ddb0c725cda6e71de576a8e72a00` |
| `ibm-plex-sans-arabic-400.woff2`  | [v15](https://fonts.gstatic.com/s/ibmplexsansarabic/v15/Qw3CZRtWPQCuHme67tEYUIx3Kh0PHR9N6Ys43PWrfQ.woff2)                         | `6010e7fd0dce5d527583951750728cbe3c895efbd16aa0f809ab8c824878c9d8` |
| `ibm-plex-sans-arabic-500.woff2`  | [v15](https://fonts.gstatic.com/s/ibmplexsansarabic/v15/Qw3NZRtWPQCuHme67tEYUIx3Kh0PHR9N6YPO_-CRXMR5Kw.woff2)                     | `90aef64fea9794f232332e907d45810ab268d1a11721340025eba2a2cdb36d5c` |
| `ibm-plex-sans-arabic-600.woff2`  | [v15](https://fonts.gstatic.com/s/ibmplexsansarabic/v15/Qw3NZRtWPQCuHme67tEYUIx3Kh0PHR9N6YPi-OCRXMR5Kw.woff2)                     | `16734a5adb27b0f363e566cbbeacec480da0dc0baa19c8f0053251c2e2bc0eac` |
| `inter-latin.woff2`               | [v20](https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2)                                           | `3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62` |
| `noto-naskh-arabic-600-700.woff2` | [v44](https://fonts.gstatic.com/s/notonaskharabic/v44/RrQKbpV-9Dd1b1OAGA6M9PkyDuVBeN2DHV20Lg.woff2)                               | `2a10d33e1f7129ab2b6ec76666e82ac5b509fbcfa7b4a3a1289bff42d2d64cd7` |

SIL Open Font License notices came from the Google Fonts repository at
[`86aced91de05cd4f96a06838124cca45be337b2b`](https://github.com/google/fonts/tree/86aced91de05cd4f96a06838124cca45be337b2b/ofl).
The notices are in [licenses](./licenses/) with normalized line endings and
trailing whitespace removed.
