# Rebuilt production image scan — 18 November 2026

Scanner: Trivy 0.76.2. Images were rebuilt from the current source after
updating the Node base and splitting ClamAV into its own service.

```sh
trivy image --ignore-unfixed --scanners vuln,secret awid-web:current-source
trivy image --ignore-unfixed --scanners vuln,secret awid-backend:current-source
trivy image --ignore-unfixed --scanners vuln,secret awid-clamav:current-source
```

All three scans reported zero high/critical findings and zero secrets. The web
and backend reports use Debian 13.7 and the Node 26.13.1 Trixie slim digest;
their Dockerfile runs `apt-get upgrade`. ClamAV uses the pinned 1.5.4 base and
`apk upgrade`; Trivy reported no ClamAV package vulnerability.

Companion unfiltered reports showed 46 HIGH package/CVE matches in each Debian
image, representing 11 unique CVEs; none had a Trivy `FixedVersion`. The CVEs,
package groups, runtime reachability rationale and 2026-12-18 recheck date are
listed in [SECURITY_REVIEW.md](../../SECURITY_REVIEW.md#unfixed-image-findings-recheck-2026-12-18).

Production Compose configuration passed `docker compose config --quiet`. The
isolated production ClamAV service became healthy with a read-only signature
volume and read-only root. The built worker scanner client accepted a clean
sample and rejected the inert EICAR test marker over the private Compose
network. Worker typecheck, all five ClamAV client tests and full `pnpm lint`
passed.
