# Demo seed font

Only the local `seed-demo-media` command reads this font, to outline dish names
in generated demo placeholders (D-023). HarfBuzz needs the uncompressed TrueType
file, so the web's WOFF2 subsets cannot be reused.

| File                           | Versioned source                                                                                                                                                      | SHA-256                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `ibm-plex-sans-arabic-600.ttf` | [`IBMPlexSansArabic-SemiBold.ttf`](https://github.com/google/fonts/raw/86aced91de05cd4f96a06838124cca45be337b2b/ofl/ibmplexsansarabic/IBMPlexSansArabic-SemiBold.ttf) | `597bd5502e5997be4414e4c9c88834b30ff3784250c84f20bce2b20e53ebd467` |

The file is unmodified and comes from the same Google Fonts commit as the web
licence notices. Its SIL Open Font License notice is in
[`LICENSE-ibmplexsansarabic.txt`](./LICENSE-ibmplexsansarabic.txt), copied from
`apps/web/src/fonts/licenses/`.
