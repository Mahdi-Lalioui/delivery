# M0 gate evidence

On 7 November 2026, `pnpm gate m0` exited 0 against Docker Desktop and the clean PR head `acf1db5f11bdd320b3bdb8d02e5a8f3c83a7f38e`. [PR #1](https://github.com/Mahdi-Lalioui/delivery/pull/1)

| Required check | Result |
|---|---|
| `pnpm verify` | 47 tooling tests, 102 unit tests, 12 real PostGIS integration tests, production build and generated OpenAPI check passed. Trace covered 4/4 M0 IDs. |
| `pnpm test:e2e --grep @smoke` | 59 passed, including 32 axe and overflow checks. Zero skipped or flaky cases. |
| Token contrast | 59 passed, including all 58 DESIGN theme pairs and the low-contrast rejection fixture. |
| Exact PR head | The workspace was clean and each required check completed successfully for the local commit. |

## GitHub Actions

- Verify passed. [Run](https://github.com/Mahdi-Lalioui/delivery/actions/runs/42385240358/job/128441110848)
- Browser smoke passed. [Run](https://github.com/Mahdi-Lalioui/delivery/actions/runs/42385240358/job/128441111095)
- Compose smoke passed. [Run](https://github.com/Mahdi-Lalioui/delivery/actions/runs/42385240358/job/128441111024)
- Gitleaks passed. [Run](https://github.com/Mahdi-Lalioui/delivery/actions/runs/42385240358/job/128441110991)
- CodeQL JavaScript and TypeScript passed. [Run](https://github.com/Mahdi-Lalioui/delivery/actions/runs/42385240423/job/128441111071)

## Clean checkout

QA cloned `acf1db5`, used a fresh store, and downloaded all 372 packages during the frozen install. `pnpm verify` and the 59-case Playwright smoke suite both exited 0 and left Git clean. The intermediate implementation commit `ce3adc6` had failed one tooling check in a fresh clone because the gate registry was in the following commit. The tested PR head includes the registry.

No P0/P1 findings remained after re-review. The design critic approved the full home and guide matrix. The dependency audit found one moderate minimatch advisory through ESLint tooling and no high or critical advisories. [Local results](verification.md) · [Screenshot matrix](screenshots/) · [Advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)
