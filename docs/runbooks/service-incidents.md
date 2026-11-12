# AWID service incidents

Use the local production Compose project when rehearsing. Set the project name and environment
file explicitly. Use the affected environment's monitoring dashboard and record times, checks,
actions and recovery in the incident log. Keep customer and restaurant details out of that log.

| Incident | Diagnose and contain | Recover and verify |
| --- | --- | --- |
| API down | Check Caddy, API health and readiness, and database connectivity. Compare the last successful request with the release time. | Restart the failed service. If the release caused it, follow the rollback steps below. Verify readiness, a signed-in request and SSE reconnect. |
| DB full | Check disk space, PostgreSQL growth and the backup destination. Pause ordering if writes are failing. | Extend storage or move verified encrypted backups. Preserve WAL and database files. Verify readiness and replay an in-flight synthetic order. |
| SMS provider down | Check provider status and worker errors. Keep OTP retries bounded. | Switch to the configured fallback adapter if available. Verify a synthetic login and one order notice. Check the pending jobs before manual resend. |
| Tiles down | Fetch the known nonempty tile from the smoke script. Check Martin and the PMTiles file. | Restore the expected archive and restart Martin. Verify the tile and the list fallback on the customer map. |
| OSRM down | Check OSRM readiness and a known route from the internal network. Confirm estimated routes are marked in the UI. | Restore the matching map extract and restart OSRM. Confirm both routed and fallback ETA with synthetic positions. |
| Restaurant complaint surge | Identify affected orders and common failure modes. Pause the affected restaurant or area when orders cannot be fulfilled. | Reconcile paid and collected totals and order state before reopening. Verify one new synthetic order and check the support queue. |

## Deploy and roll back

During local readiness, run deployment steps only against the disposable Compose project.
Follow the [deployment guide](../DEPLOY.md) for migration order and smoke checks. Record the
image tag and encrypted backup before any migration. To roll back, use the previous approved
image tag only after confirming schema compatibility. If the schema is incompatible, stop
writers and follow the recovery plan with a verified backup.

## Restore

Run the [encrypted restore drill](../DEPLOY.md#restore-drill) on the recovery host and record
elapsed time and media verification. Recover into an isolated stack first. Compare recent
order IDs and totals, replay pending jobs and verify the customer, merchant and courier flows
before bringing any recovered stack online.

## Ramadan peak checklist

Confirm Ramadan hours, Iftar slots and courier staffing with pilot restaurants. Rehearse
the pre-iftar load on a disposable stack. Verify ordering controls, alert routing, on-call
contacts, last night's backup and current capacity. Track queue age, quote errors and delayed
orders during the peak.
