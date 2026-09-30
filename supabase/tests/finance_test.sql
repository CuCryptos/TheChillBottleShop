-- Finance tests: expenses, budget lines and the P&L actuals view.
-- Run with supabase/tests/run.sh.

\set ON_ERROR_STOP on

create or replace function pg_temp.assert_eq(actual anyelement, expected anyelement, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL %: expected %, got %', label, expected, actual;
  end if;
  raise notice 'ok  %', label;
end $$;

create or replace function pg_temp.assert_raises(sql text, fragment text, label text)
returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAIL %: expected error containing "%"', label, fragment;
exception when others then
  if sqlerrm like 'FAIL %' or position(fragment in sqlerrm) = 0 then
    raise exception 'FAIL %: got "%"', label, sqlerrm;
  end if;
  raise notice 'ok  %', label;
end $$;

create or replace function pg_temp.actual(p_month date, p_line text)
returns bigint language sql as $$
  select amount_cents from pnl_actuals_monthly where month = p_month and line = p_line
$$;

-- Fixtures ------------------------------------------------------------------
insert into members (id, email, full_name, date_of_birth, id_verified_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@x.test', 'Member 1', '1980-01-01', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@x.test', 'Member 2', '1980-01-01', now()),
  ('00000000-0000-0000-0000-0000000000a3', 'a3@x.test', 'Member 3', '1980-01-01', now());

-- Founding ($150) and Member ($75) count in November; pending does not.
insert into memberships (member_id, tier_code, status, starts_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'founding', 'active',    '2026-11-10 09:00-10'),
  ('00000000-0000-0000-0000-0000000000a2', 'member',   'cancelled', '2026-11-20 09:00-10'),
  ('00000000-0000-0000-0000-0000000000a3', 'member',   'pending',   '2026-11-21 09:00-10');

insert into products (id, brewery, name, package) values
  ('00000000-0000-0000-0000-00000000b001', 'Test Brewing', 'Hazy IPA', '4-pack 16oz cans');
insert into drops (id, title, slug, status, reservation_opens_at, reservation_closes_at) values
  ('00000000-0000-0000-0000-00000000d001', 'November', 'november', 'fulfilling',
   '2026-10-01 00:00-10', '2026-10-08 00:00-10');
insert into drop_items (id, drop_id, product_id, planned_qty, received_qty, allocated_qty, price_cents) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000d001',
   '00000000-0000-0000-0000-00000000b001', 10, 10, 4, 2400);

-- Charged 2 × $24 on Nov 5; charged 1 × $24 at 05:00 UTC Dec 1 (still Nov 30 in
-- Honolulu) and forfeited in December with a $21.60 refund; one never charged.
insert into reservations (drop_item_id, member_id, qty, status, tier_code, charged_at, forfeited_at, refund_due_cents) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a1', 2, 'fulfilled', 'founding',
   '2026-11-05 12:00-10', null, null),
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a2', 1, 'forfeited', 'member',
   '2026-12-01 05:00+00', '2026-12-10 12:00-10', 2160),
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a3', 1, 'allocated', 'member',
   null, null, null);

insert into purchase_orders (po_number, invoice_number, invoice_date, invoice_total_cents) values
  ('PO-1', 'INV-1', '2026-11-03', 150000);
insert into purchase_orders (po_number) values ('PO-2');

insert into expenses (incurred_on, category, vendor, amount_cents) values
  ('2026-11-01', 'rent',      'Landlord', 300000),
  ('2026-11-30', 'rent',      'Landlord',   5000),
  ('2026-12-02', 'marketing', 'Meta',      12345);

-- Actuals ---------------------------------------------------------------------
select pg_temp.assert_eq(pg_temp.actual('2026-11-01', 'beer_sales'), 7200::bigint,
  'beer sales by Hawaiʻi month of charge, uncharged excluded');
select pg_temp.assert_eq(pg_temp.actual('2026-12-01', 'beer_sales'), null::bigint,
  'charge at 05:00 UTC Dec 1 counts in November');
select pg_temp.assert_eq(pg_temp.actual('2026-12-01', 'refunds'), -2160::bigint,
  'forfeit refund is negative revenue in the month forfeited');
select pg_temp.assert_eq(pg_temp.actual('2026-11-01', 'membership_fees'), 22500::bigint,
  'membership fees at start, pending excluded');
select pg_temp.assert_eq(pg_temp.actual('2026-11-01', 'beer_cogs'), 150000::bigint,
  'beer cost by invoice date, uninvoiced PO excluded');
select pg_temp.assert_eq(pg_temp.actual('2026-11-01', 'rent'), 305000::bigint,
  'expenses summed by category and month');
select pg_temp.assert_eq(pg_temp.actual('2026-12-01', 'marketing'), 12345::bigint,
  'expense in the next month');
select pg_temp.assert_eq((select count(*) from pnl_actuals_monthly)::int, 6,
  'one row per month and line');

-- Constraints -----------------------------------------------------------------
insert into budget_lines (month, line, amount_cents) values ('2026-11-01', 'beer_sales', 800000);

select pg_temp.assert_raises(
  $$insert into budget_lines (month, line, amount_cents) values ('2026-11-15', 'rent', 1)$$,
  'budget_lines_month_check', 'budget month must be the first of a month');
select pg_temp.assert_raises(
  $$insert into budget_lines (month, line, amount_cents) values ('2026-11-01', 'yacht', 1)$$,
  'budget_lines_line_check', 'unknown budget line rejected');
select pg_temp.assert_raises(
  $$insert into budget_lines (month, line, amount_cents) values ('2026-11-01', 'beer_sales', 1)$$,
  'budget_lines_month_line_key', 'one budget amount per month and line');
select pg_temp.assert_raises(
  $$insert into expenses (incurred_on, category, amount_cents) values ('2026-11-01', 'beer_cogs', 1)$$,
  'expenses_category_check', 'expense category must be an opex line');
select pg_temp.assert_raises(
  $$insert into expenses (incurred_on, category, amount_cents) values ('2026-11-01', 'rent', -1)$$,
  'expenses_amount_cents_check', 'negative expense rejected');

-- Access ----------------------------------------------------------------------
select pg_temp.assert_eq(
  has_table_privilege('anon', 'pnl_actuals_monthly', 'select')
    or has_table_privilege('authenticated', 'pnl_actuals_monthly', 'select'),
  false, 'API roles have no select on the P&L view');

set role anon;
do $$ begin
  perform 1 from pnl_actuals_monthly;
  raise exception 'FAIL anon can read pnl_actuals_monthly';
exception when insufficient_privilege then
  raise notice 'ok  anon cannot read the P&L view';
end $$;
reset role;

set role authenticated;
do $$ begin
  perform 1 from pnl_actuals_monthly;
  raise exception 'FAIL authenticated can read pnl_actuals_monthly';
exception when insufficient_privilege then
  raise notice 'ok  authenticated cannot read the P&L view';
end $$;
reset role;

\echo 'All finance tests passed.'
