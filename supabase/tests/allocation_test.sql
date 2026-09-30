-- Allocation engine tests. Run against a scratch database with:
--   supabase/tests/run.sh
-- Any failed assertion raises and aborts with a non-zero exit code.

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

-- Fixtures ------------------------------------------------------------------
insert into members (id, email, full_name, date_of_birth, id_verified_at) values
  ('00000000-0000-0000-0000-00000000000a', 'a@x.test', 'Founder A', '1980-01-01', now()),
  ('00000000-0000-0000-0000-00000000000b', 'b@x.test', 'Member B',  '1985-01-01', now()),
  ('00000000-0000-0000-0000-00000000000c', 'c@x.test', 'Member C',  '1990-01-01', now()),
  ('00000000-0000-0000-0000-00000000000d', 'd@x.test', 'Member D',  '1990-01-01', now()),
  ('00000000-0000-0000-0000-00000000000e', 'e@x.test', 'Unverified','1990-01-01', null);

insert into memberships (member_id, tier_code, status) values
  ('00000000-0000-0000-0000-00000000000a', 'founding', 'active'),
  ('00000000-0000-0000-0000-00000000000b', 'member',   'active'),
  ('00000000-0000-0000-0000-00000000000c', 'member',   'active'),
  ('00000000-0000-0000-0000-00000000000d', 'member',   'active'),
  ('00000000-0000-0000-0000-00000000000e', 'member',   'active');

insert into products (id, brewery, name, package) values
  ('00000000-0000-0000-0000-0000000000f1', 'Test Brewing', 'Hazy Test IPA', '4-pack 16oz cans');

-- Drop opens to the public 36h from now: founders (48h early) are in, members (24h) are not yet.
insert into drops (id, title, slug, status, reservation_opens_at, reservation_closes_at) values
  ('00000000-0000-0000-0000-0000000000d1', 'Drop 1', 'drop-1', 'announced',
   now() + interval '36 hours', now() + interval '7 days');

insert into drop_items (id, drop_id, product_id, planned_qty, price_cents) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-0000000000f1', 3, 2400);

-- Tests ---------------------------------------------------------------------
select pg_temp.assert_raises(
  $$select reserve('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a1', 1)$$,
  'reservations open for you at', 'member tier cannot reserve before its early-access window');

select pg_temp.assert_raises(
  $$select reserve('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 3)$$,
  'limit is 2', 'founding per-item limit enforced');

select pg_temp.assert_eq(
  (reserve('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 2)).status,
  'allocated'::reservation_status, 'founder allocated during early access');

select pg_temp.assert_raises(
  $$select reserve('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 1)$$,
  'already have a reservation', 'one reservation per member per item');

-- Open to members.
update drops set reservation_opens_at = now() - interval '1 hour' where slug = 'drop-1';

select pg_temp.assert_raises(
  $$select reserve('00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-0000000000a1', 1)$$,
  'ID verification required', 'unverified member blocked');

select pg_temp.assert_eq(
  (reserve('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a1', 1)).status,
  'allocated'::reservation_status, 'member B gets last unit');
select pg_temp.assert_eq(
  (reserve('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1', 1)).status,
  'waitlisted'::reservation_status, 'member C waitlisted when sold out');
select pg_temp.assert_eq(
  (reserve('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000a1', 1)).status,
  'waitlisted'::reservation_status, 'member D waitlisted behind C');

select pg_temp.assert_eq(
  (select fully_allocated from drop_item_allocation_status
    where drop_item_id = '00000000-0000-0000-0000-0000000000a1'),
  true, 'view reports drop item fully allocated');
select pg_temp.assert_eq(
  (select waitlisted_qty from drop_item_allocation_status
    where drop_item_id = '00000000-0000-0000-0000-0000000000a1'),
  2, 'view reports waitlist demand');

-- B cancels → C (oldest on waitlist) is promoted.
select cancel_reservation(
  (select id from reservations where member_id = '00000000-0000-0000-0000-00000000000b'));
select pg_temp.assert_eq(
  (select status from reservations where member_id = '00000000-0000-0000-0000-00000000000c'),
  'allocated'::reservation_status, 'cancellation promotes oldest waitlisted member');

-- Oversell is impossible even with a direct update.
select pg_temp.assert_raises(
  $$update drop_items set allocated_qty = 4 where id = '00000000-0000-0000-0000-0000000000a1'$$,
  'drop_items_no_oversell', 'check constraint blocks oversell');

-- Short shipment: 2 arrive instead of 3. Newest allocation (C) goes back to the waitlist.
select receive_drop_item('00000000-0000-0000-0000-0000000000a1', 2);
select pg_temp.assert_eq(
  (select status from reservations where member_id = '00000000-0000-0000-0000-00000000000c'),
  'waitlisted'::reservation_status, 'short shipment bumps newest allocation');
select pg_temp.assert_eq(
  (select status from reservations where member_id = '00000000-0000-0000-0000-00000000000a'),
  'allocated'::reservation_status, 'founder keeps allocation on short shipment');
select pg_temp.assert_eq(
  (select allocated_qty from drop_items where id = '00000000-0000-0000-0000-0000000000a1'),
  2, 'allocated equals received after shortfall');

-- Founder cancels 2 units → C (earlier request than D) gets 1, D gets 1.
select cancel_reservation(
  (select id from reservations where member_id = '00000000-0000-0000-0000-00000000000a'));
select pg_temp.assert_eq(
  (select count(*)::int from reservations
    where drop_item_id = '00000000-0000-0000-0000-0000000000a1' and status = 'allocated'),
  2, 'freed units promote both waitlisted members');

-- Ledger nets out to the allocated quantity.
select pg_temp.assert_eq(
  (select sum(qty_delta)::int from inventory_ledger
    where drop_item_id = '00000000-0000-0000-0000-0000000000a1'),
  (select allocated_qty from drop_items where id = '00000000-0000-0000-0000-0000000000a1'),
  'ledger reconciles with allocated_qty');

-- Age rule.
select pg_temp.assert_raises(
  $$insert into members (email, full_name, date_of_birth) values ('kid@x.test', 'Kid', current_date - interval '20 years')$$,
  'members_21_plus', 'under-21 member rejected');

-- 30-day payment window view.
insert into purchase_orders (po_number, invoice_number, invoice_date, invoice_total_cents)
values ('PO-1', 'INV-1', current_date - 25, 100000);
select pg_temp.assert_eq(
  (select days_remaining from purchase_orders_payment_due where po_number = 'PO-1'),
  5, 'invoice shows 5 days left under 30-day rule');

-- Public API roles cannot call allocation functions.
select pg_temp.assert_eq(
  has_function_privilege('anon', 'reserve(uuid, uuid, integer, text)', 'execute')
  or has_function_privilege('authenticated', 'reserve(uuid, uuid, integer, text)', 'execute')
  or has_function_privilege('anon', 'receive_drop_item(uuid, integer)', 'execute')
  or has_function_privilege('authenticated', 'cancel_reservation(uuid, text)', 'execute'),
  false, 'API roles cannot execute allocation functions');

\echo 'All allocation tests passed.'
