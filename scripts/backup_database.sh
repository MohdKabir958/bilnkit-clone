#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL securely}"
backup_dir="${1:?Usage: backup_database.sh /private/backup/directory}"
umask 077
mkdir -p "$backup_dir"
backup_file="$backup_dir/market-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$backup_file"
pg_restore --list "$backup_file" >/dev/null
sha256sum "$backup_file" > "$backup_file.sha256"
printf 'Verified dump archive: %s\n' "$backup_file"
