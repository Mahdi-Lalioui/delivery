# Connected pilot capacity run

On 20 November the k6 2.3.0 runner used the fresh production API image
`awid-backend:79132f66`, disposable PostGIS, and local HTTPS Caddy with
its internal CA. The Linux runner bound real loopback source addresses
through a shared local network namespace. Caddy forwarding had been
verified separately, and the API's default limits stayed enabled.

The seeder generated 30,000 fresh quotes and 1,000 assigned couriers.
The one-minute run targeted 500 placements and 200 positions per second,
with 800 and 400 preallocated VUs respectively. This is a Mac Docker
rehearsal with no deployed worker, not a production hardware benchmark.

| Metric | Result | Gate |
|---|---:|---:|
| Placement p95 | 6,422 ms | <400 ms |
| Position p95 | 6,334 ms | <400 ms |
| Successful completed placements | 8,489 / 8,489 | >99% |
| Successful completed positions | 4,231 / 4,231 | >99% |
| HTTP failure rate | 0 / 12,720 | <1% |
| Dropped iterations | 29,282 | 0 |

**Failed.** k6 exited 99 because both latency thresholds and the dropped
iteration threshold failed. The completed-request success rate does not
include unscheduled iterations. A production-sized Linux run and resource
profile are needed before attributing this to a specific query or subsystem.

## 1× comparison

A fresh disposable database on the same setup passed at 50 placements and
20 positions per second for one minute. Placement p95 was 15.97 ms and
position p95 was 6.79 ms. All 3,001 placements and 1,201 positions succeeded,
with zero HTTP failures and zero dropped iterations. This confirms the
fixture and request path work at the lower rate.
