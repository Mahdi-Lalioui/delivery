# M0 runtime evidence

Verified on 7 November 2026 on macOS arm64. Runtime downloads and VM state live in temporary directories. The repository mount in the VM is read-only.

| Check | Result |
|---|---|
| Official Darwin arm64 Node archive SHA-256 | Matched the Node 26.13.0 release checksum |
| `node --version` | `v26.13.0` |
| `pnpm --version` | `12.18.0` |
| `docker info` | Rootless Docker Engine 29.9.3 on Ubuntu 26.04.1 aarch64 |
| `docker compose version` | `Docker Compose version v5.7.0` |
| `docker run --rm --platform=linux/amd64 postgis/postgis:18-3.7@sha256:440bdd14e3edccfce04d080d8a1a0cbae5763fa16a1c4172bff83530828461de postgres --version` | `postgres (PostgreSQL) 18.6 (Debian 18.6-1.pgdg13+2)` |
| `pnpm exec playwright install --list` | Playwright 1.65.0, Chromium 1254, Chromium headless shell 1254, WebKit 2388, FFmpeg 1013 |

The PostGIS version command proves amd64 execution on the development host. Database integration and browser smoke evidence will be recorded from their suites.
