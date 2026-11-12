#!/usr/bin/env bash
set -euo pipefail

AWID_INIT_PASSWORD="$(cat /run/secrets/awid_database_password)"
export AWID_INIT_PASSWORD
if [[ ! "$AWID_INIT_PASSWORD" =~ ^[0-9a-fA-F]{64}$ ]]; then
  printf '%s\n' 'The AWID database password must be 32 random bytes in hex.' >&2
  exit 1
fi

psql --no-psqlrc --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv application_password AWID_INIT_PASSWORD
CREATE ROLE awid LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'application_password';
ALTER DATABASE awid OWNER TO awid;
REVOKE CONNECT ON DATABASE awid FROM PUBLIC;
GRANT CONNECT ON DATABASE awid TO awid;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
SQL
