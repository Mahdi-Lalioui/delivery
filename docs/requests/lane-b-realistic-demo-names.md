# Lane B → lane A: realistic fictional restaurant names

Status: done (2026-11-12). Lane B checked `packages/db/src`, the seeds and `infra/` on
`origin/main`, `origin/lane-a`, `origin/demo` and `origin/codex/awid-integration`: no display
name contains "Démo" or "Demo". Only the preview catalog had them, renamed below.

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
