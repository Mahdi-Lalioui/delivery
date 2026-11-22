#!/usr/bin/env bash
set -euo pipefail

AWID_INIT_PASSWORD="$(cat /run/secrets/awid_database_password)"
AWID_RUNTIME_PASSWORD="$(cat /run/secrets/awid_runtime_password)"
export AWID_INIT_PASSWORD AWID_RUNTIME_PASSWORD
if [[ ! "$AWID_INIT_PASSWORD" =~ ^[0-9a-fA-F]{64}$ || ! "$AWID_RUNTIME_PASSWORD" =~ ^[0-9a-fA-F]{64}$ || "$AWID_INIT_PASSWORD" == "$AWID_RUNTIME_PASSWORD" ]]; then
  printf '%s\n' 'Use distinct AWID database passwords of 32 random bytes each in hex.' >&2
  exit 1
fi

psql --no-psqlrc --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv application_password AWID_INIT_PASSWORD
BEGIN;
SELECT format('CREATE ROLE awid LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', :'application_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'awid') \gexec
\getenv runtime_password AWID_RUNTIME_PASSWORD
SELECT format('CREATE ROLE awid_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L', :'runtime_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'awid_runtime') \gexec
ALTER DATABASE awid OWNER TO awid;
REVOKE CONNECT ON DATABASE awid FROM PUBLIC;
GRANT CONNECT ON DATABASE awid TO awid, awid_runtime;
REVOKE TEMPORARY ON DATABASE awid FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA IF NOT EXISTS graphile_worker AUTHORIZATION awid;
GRANT USAGE ON SCHEMA graphile_worker TO awid_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE awid IN SCHEMA public, graphile_worker GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO awid_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE awid IN SCHEMA public, graphile_worker GRANT USAGE, SELECT ON SEQUENCES TO awid_runtime;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I.%I TO awid_runtime', n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relowner = 'awid'::regrole AND c.relkind IN ('r', 'p')
  AND n.nspname IN ('public', 'graphile_worker')
  AND (n.nspname, c.relname) NOT IN (('graphile_worker', 'migrations'), ('public', 'admins'), ('public', 'admin_bootstrap_audit')) \gexec
SELECT format('GRANT USAGE, SELECT ON SEQUENCE %I.%I TO awid_runtime', n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relowner = 'awid'::regrole AND c.relkind = 'S'
  AND n.nspname IN ('public', 'graphile_worker') \gexec
SELECT 'GRANT SELECT ON graphile_worker.migrations TO awid_runtime'
WHERE to_regclass('graphile_worker.migrations') IS NOT NULL \gexec
SELECT 'GRANT SELECT, UPDATE (last_totp_step) ON public.admins TO awid_runtime'
WHERE to_regclass('public.admins') IS NOT NULL \gexec
COMMIT;
SQL
