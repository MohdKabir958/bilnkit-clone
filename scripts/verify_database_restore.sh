#!/usr/bin/env bash
set -euo pipefail
umask 077
script_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "$script_root/database_recovery.mjs" restore "${1:?Usage: verify_database_restore.sh /private/backup.dump}"
