#!/usr/bin/env bash
# Apply the migrations to a throwaway Postgres database and run the SQL tests.
# Usage: DATABASE_URL=postgres://user@localhost/postgres supabase/tests/run.sh
set -euo pipefail

cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?set DATABASE_URL to a Postgres server you can create databases on}"

db="chill_test_$$"
psql "$DATABASE_URL" -qc "create database $db"
trap 'psql "$DATABASE_URL" -qc "drop database if exists $db with (force)"' EXIT
test_url="${DATABASE_URL%/*}/$db"

# Minimal stand-in for Supabase's auth schema so RLS policies compile.
psql "$test_url" -q -v ON_ERROR_STOP=1 <<'SQL'
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
SQL

for f in supabase/migrations/*.sql; do
  psql "$test_url" -q -v ON_ERROR_STOP=1 -f "$f"
done
for t in supabase/tests/*_test.sql; do
  psql "$test_url" -q -v ON_ERROR_STOP=1 -o /dev/null -f "$t" 2>&1 \
    | sed -n "s/.*NOTICE:  //p; /ERROR/p; /passed/p"
done
