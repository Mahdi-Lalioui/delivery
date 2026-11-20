# Pilot load harness

`pilot.js` drives fresh order placement and courier position intake over HTTP.
It uses the SPEC NFR-03 rates as an explicitly labeled proxy for 10× pilot
load: 50 placement requests/s becomes 500/s; 100 drivers sending every 5s
(20 positions/s) becomes 1,000 drivers sending every 5s (200 positions/s).
This proxy is not a measured pilot forecast. NFR-03 also sets `place` p95 at
400 ms; the 400 ms position p95 and 99% success checks here are harness gates,
not a separately stated SPEC target.

## Fixtures

Use isolated synthetic data only. Pass fixture JSON with either
`LOAD_FIXTURES_JSON` or `LOAD_FIXTURES_FILE` (a path to a JSON file). Prefer the
file form for large fixture sets. The harness never prints fixture contents.
Keep the fixture file private and outside version control.

```json
{
  "placements": [
    {
      "sessionCookie": "__Host-session=<synthetic-session-token>",
      "quoteId": "00000000-0000-4000-8000-000000000001"
    }
  ],
  "couriers": [
    {
      "sessionCookie": "__Host-session=<synthetic-session-token>",
      "orderId": "00000000-0000-4000-8000-000000000002",
      "latitude": 36.75,
      "longitude": 3.06,
      "accuracyM": 10,
      "heading": 45
    }
  ]
}
```

Each placement fixture must contain a distinct, unconsumed quote and a valid
customer session. Each courier fixture must map one distinct courier session
to one active assigned order in a state that accepts positions. It supplies a
base coordinate; the script shifts latitude and longitude slightly on each
sample so repeated positions are moving. Use enough placement fixtures for the
whole run (`rate × duration`, default 30,000) and at least 1,000 courier/order
assignments. The harness rejects undersized fixture sets before sending load.

## Run

Install k6 2.3.0 as recorded in `docs/DECISIONS.md`, start a disposable local
production Compose stack with synthetic data, then run from the repository
root. Supply the exact public origin used for the session cookies and the
reachable Caddy/API origin. Do not point this harness at production.

```sh
LOAD_BASE_URL=https://127.0.0.1 \
LOAD_ORIGIN=https://127.0.0.1 \
LOAD_FIXTURES_FILE=/private/tmp/zaafran-load-fixtures.json \
k6 run load/pilot.js
```

The defaults run both scenarios for one minute: 500 fresh order placements/s
and 200 courier positions/s, with 1,000 distinct courier sessions and order
assignments. `LOAD_POSITION_DRIVERS` controls the courier fixture pool and
defaults to 1,000; `LOAD_POSITION_VUS` controls k6 workers, not simulated
courier count.
Override `LOAD_DURATION`, `LOAD_PLACEMENT_RATE`, `LOAD_POSITION_RATE`,
`LOAD_PLACEMENT_VUS`, `LOAD_POSITION_VUS`, and `LOAD_POSITION_DRIVERS` only when recording the exact
run assumptions alongside results. Default thresholds require placement p95
below 400 ms, position p95 below 400 ms, at least 99% success for each route,
and under 1% failed HTTP requests. A run passes only when k6 itself exits 0;
fixture validation or syntax checks are not load results.

The harness covers only the two HTTP paths. It does not create fixtures,
exercise the 300 board sockets, or measure the production 4-vCPU/8-GB target.

## Source-IP requirement

The API has a shared default limit of 120 requests/minute per source IP before
route handling (`apps/api/src/app.ts`; regression: `apps/api/test/policy.test.ts`).
The combined default workload is 700 requests/second, so a single-source-IP
run is expected to measure this limiter and fail the HTTP-success thresholds;
that is not evidence of API capacity. Do not raise or disable the production
limit to make this test pass. At 2 requests/second per source IP, the full
700-request/second workload needs at least 350 evenly utilized source IPs.
Confirm that the addresses are actually visible as distinct client IPs at the
API after Caddy forwarding; multiple k6 processes behind one NAT do not meet
this requirement. Distribute the workload across enough real source IPs (or
independent load generators) and preserve the exact distribution in the
evidence report. The runner must fail on dropped iterations as well as request
or latency thresholds.
