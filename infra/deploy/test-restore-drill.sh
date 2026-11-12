#!/usr/bin/env bash
set -euo pipefail

directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
image='postgis/postgis:18-3.7@sha256:440bdd14e3edccfce04d080d8a1a0cbae5763fa16a1c4172bff83530828461de'
umask 077
fixture="$(mktemp -d)"
source_db=''
cleanup() {
  if [[ -n "$source_db" ]]; then docker rm --force --volumes "$source_db" >/dev/null; fi
  rm -rf -- "$fixture"
}
trap cleanup EXIT

source_db="$(docker run --detach --network none --platform linux/amd64 \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=awid "$image")"
for ((attempt = 1; attempt <= 60; attempt += 1)); do
  if docker exec "$source_db" pg_isready -h 127.0.0.1 -U postgres -d awid >/dev/null; then break; fi
  sleep 1
done
docker exec -i "$source_db" psql -X -v ON_ERROR_STOP=1 -U postgres -d awid >/dev/null <<'SQL'
CREATE TABLE media_uploads (
  status text, quarantine_key text, preview_key text,
  ready_variants jsonb, bytes bigint, delivery_proof_purging boolean NOT NULL DEFAULT false
);
INSERT INTO media_uploads (status, quarantine_key, preview_key, ready_variants, bytes) VALUES
  ('ready', 'quarantine/cleaned', 'previews/cleaned', '[{"key":"ready/fixture.webp","bytes":5}]', 10),
  ('awaiting_crop', 'quarantine/pending', 'previews/pending', NULL, 8),
  ('rejected', 'quarantine/rejected', NULL, NULL, 9);
CREATE TABLE billing_proof_media (
  status text, quarantine_key text, bytes bigint, ready_key text, ready_bytes bigint
);
INSERT INTO billing_proof_media VALUES ('ready', NULL, 8, 'billing/proof', 5);
INSERT INTO media_uploads (status, ready_variants, delivery_proof_purging) VALUES
  ('ready', '[{"key":"ready/purging.webp","bytes":2}]', true);
SQL
age-keygen -o "$fixture/identity.txt" 2>/dev/null
age-keygen -y "$fixture/identity.txt" > "$fixture/recipients.txt"
mkdir -p "$fixture/backup" "$fixture/media"
docker exec "$source_db" pg_dump -U postgres -d awid --format custom \
  | age -R "$fixture/recipients.txt" -o "$fixture/backup/postgres.dump.age"

archive() {
  rm -f -- "$fixture/backup/media.tar.age"
  tar -C "$fixture/media" -cf - . \
    | age -R "$fixture/recipients.txt" -o "$fixture/backup/media.tar.age"
}

drill() {
  bash "$directory/restore-drill.sh" "$fixture/backup" "$fixture/identity.txt" > "$fixture/result" 2>&1
}

expect_failure() {
  if drill; then
    printf '%s\n' 'The restore drill accepted an invalid media backup.' >&2
    exit 1
  fi
  grep -q -- "$1" "$fixture/result"
}

storage_file() {
  python3 -c 'from hashlib import sha256; import sys; print(sha256(sys.argv[1].encode()).hexdigest())' "$1"
}
ready="$fixture/media/$(storage_file ready/fixture.webp)"
original="$fixture/media/$(storage_file quarantine/pending)"
preview="$fixture/media/$(storage_file previews/pending)"
printf 'proof' > "$fixture/media/$(storage_file billing/proof)"
printf 'image' > "$ready"
printf 'original' > "$original"
printf 'preview' > "$preview"
ln "$ready" "$fixture/media/.fixture.tmp"
archive
if ! drill; then cat "$fixture/result" >&2; exit 1; fi
grep -q 'verified 4 referenced media files' "$fixture/result"

printf 'tiny' > "$ready"
rm -- "$preview"
archive
expect_failure '2 missing or invalid media files'
ln -s "$original" "$fixture/media/link"
archive
expect_failure 'Unsafe media archive member'

rm -- "$fixture/media/link"
printf 'image' > "$ready"
printf 'preview' > "$preview"
archive
python3 - "$fixture/backup/media.tar.age" <<'PYTHON'
from pathlib import Path
import sys

path = Path(sys.argv[1])
path.write_bytes(path.read_bytes()[:-1])
PYTHON
expect_failure 'Media recovery failed'
archive
mkdir "$fixture/bin" "$fixture/scratch"
export AWID_TEST_DOCKER
AWID_TEST_DOCKER="$(command -v docker)"
cat > "$fixture/bin/docker" <<'DOCKER'
#!/usr/bin/env bash
"$AWID_TEST_DOCKER" "$@" || exit $?
if [[ "$1" == rm ]]; then exit 1; fi
DOCKER
chmod +x "$fixture/bin/docker"
PATH="$fixture/bin:$PATH" TMPDIR="$fixture/scratch" expect_failure 'Could not remove recovery container'
[[ -z "$(ls -A "$fixture/scratch")" ]]
printf '%s\n' 'Restore drill cases passed.'
