#!/usr/bin/env bash
set -euo pipefail
: "${RESTORE_DATABASE_URL:?Set a NEW isolated database URL ending in _restore_test}"
archive="${1:?Usage: verify_database_restore.sh /private/backup.dump}"
node -e 'const u=new URL(process.env.RESTORE_DATABASE_URL);if(!u.pathname.endsWith("_restore_test"))throw Error("Restore target must end in _restore_test")'
tables="$(psql --dbname="$RESTORE_DATABASE_URL" -XAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
[[ "$tables" == 0 ]] || { echo 'Restore target must be empty; no tables were deleted.' >&2; exit 1; }
pg_restore --dbname="$RESTORE_DATABASE_URL" --exit-on-error --no-owner --no-privileges "$archive"
psql --dbname="$RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c 'SELECT (SELECT count(*) FROM "User") AS users, (SELECT count(*) FROM "Vendor") AS vendors, (SELECT count(*) FROM "MenuItem") AS products, (SELECT count(*) FROM "Order") AS orders, (SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL) AS migrations;'
