# MER-12 menu import verification

- `pnpm test:e2e:auth --grep @menu-import --fail-on-flaky-tests` passed against the production build and PostGIS. The owner started with zero categories, downloaded the canonical CSV template, saw the row and field error for an inexact price, then imported an item and its category.
- The browser journey interrupted the first readback after the write. Retrying reused the original apply key, returned the committed receipt, and retained one category and one item. A second import of the same external key left the item unchanged.
- Fifteen file-parser tests passed for CSV and XLSX, including both archive metadata regressions. Session-bound preview rejects a changed session before reading or planning merchant data.
- `pnpm trace --through m2` still reports 35/37. The browser test now carries `MER-12`. `MER-01` and `MER-14` remain open.
