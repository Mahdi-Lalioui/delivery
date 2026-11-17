# Dependency audit update — 17 November 2026

- Command: `pnpm verify` on `lane-a` after the order action lock fix.
- Result before the audit step: format, lint, typecheck, 2,061 unit tests, mobile tests, build, OpenAPI check, 342 Postgres integration tests, knip and dependency-cruiser passed.
- `pnpm audit --prod --audit-level high` failed on one high finding: picomatch `4.0.7`, reachable through Expo/Metro's `fdir > micromatch` path. The finding is [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf). GitHub currently lists no patched versions; the upstream release page still identifies `4.0.7` as latest. No audit exception or lockfile override was added.
- This prevents a green `pnpm verify` until upstream publishes a fixed version or the affected dependency path can be safely removed. The audit output was captured in `/private/tmp/awid-verify-order-lock.log`.
