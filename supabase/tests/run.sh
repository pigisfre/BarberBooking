#!/usr/bin/env bash
# Esegue i test dello schema su un Postgres locale (>= 15) in un database usa e getta.
#   bash supabase/tests/run.sh                 # usa PGHOST/PGPORT/PGUSER dell'ambiente
# Carica: stub di Supabase -> tutte le migrazioni in ordine -> schema.test.sql
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="bb_test_$$"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database $DB" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/tests/supabase-stub.sql
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"; done
psql -v ON_ERROR_STOP=1 -q -o /dev/null -d "$DB" -f supabase/tests/schema.test.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //; s/^NOTICE:  //'
