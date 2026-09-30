#!/usr/bin/env bash
# Apply the migrations to a throwaway Postgres database and run the SQL tests.
# Each *_test.sql file gets its own fresh database so fixtures don't collide.
# Usage: DATABASE_URL=postgres://user@localhost/postgres supabase/tests/run.sh
set -euo pipefail

cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?set DATABASE_URL to a Postgres server you can create databases on}"

db=""
trap '[ -n "$db" ] && psql "$DATABASE_URL" -qc "drop database if exists $db with (force)"' EXIT

fresh_db() {
  db="chill_test_$$_$1"
  psql "$DATABASE_URL" -qc "create database $db"
  test_url="${DATABASE_URL%/*}/$db"

  # Minimal stand-in for Supabase: API roles, their default grants, and auth.uid().
  psql "$test_url" -q -v ON_ERROR_STOP=1 <<'SQL'
-- Mirror Supabase: API roles exist and get EXECUTE on new public functions by default.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
alter default privileges in schema public grant execute on functions to anon, authenticated;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
SQL

  for f in supabase/migrations/*.sql; do
    psql "$test_url" -q -v ON_ERROR_STOP=1 -f "$f"
  done
}

for t in supabase/tests/*_test.sql; do
  fresh_db "$(basename "$t" .sql)"
  psql "$test_url" -q -v ON_ERROR_STOP=1 -o /dev/null -f "$t" 2>&1 \
    | sed -n "s/.*NOTICE:  //p; /ERROR/p; /passed/p"
  psql "$DATABASE_URL" -qc "drop database $db with (force)"
  db=""
done
