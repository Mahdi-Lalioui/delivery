# Lane B → lane A: realistic fictional restaurant names

Status: integrated (2026-11-12).

Mahdi's review: restaurant names containing "Démo" break the illusion in screenshots and demos.

Done on `lane-b` (merge it, do not revert): the preview catalog renamed
"L’Atelier Démo" → "L’Atelier Sidi Yahia" (`atelier-sidi-yahia`) and
"Le Four Démo" → "Le Four de Belcourt" (`four-belcourt`), with
`e2e/team-preview.preview.ts`, `docs/TEAM_PREVIEW.md` and the web tests updated.

Asked of lane A:

1. Check `packages/db/src/demo-seed.ts` and any seed fixtures for display names with "Démo",
   "Demo", "Test" or similar, and rename them to realistic fictional Algerian names (keep
   `is_demo` true, keep them clearly fictional, no real restaurant names).
2. Keep any lane A e2e or doc references in step with the new names when merging `lane-b`.

Lane A checked all 40 entries in `packages/db/src/demo-seed-menu.ts`. They already have
fictional French and Arabic display names without demo markers. The reserved owner account,
internal slugs and `is_demo` continue to identify these records as synthetic. The preview
catalog tests and preview journey use the new names and slugs.
