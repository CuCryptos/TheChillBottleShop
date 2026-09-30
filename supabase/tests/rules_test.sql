-- Tests for the research-driven allocation rules: Founding guarantee, draw
-- drops, pickup forfeiture and no-show penalties. Run with supabase/tests/run.sh.

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
-- Founders F1–F3, members M1–M2, and E (a member with two recent no-shows).
insert into members (id, email, full_name, date_of_birth, id_verified_at) values
  ('00000000-0000-0000-0000-0000000000f1', 'f1@x.test', 'Founder 1', '1980-01-01', now()),
  ('00000000-0000-0000-0000-0000000000f2', 'f2@x.test', 'Founder 2', '1980-01-01', now()),
  ('00000000-0000-0000-0000-0000000000f3', 'f3@x.test', 'Founder 3', '1980-01-01', now()),
  ('00000000-0000-0000-0000-0000000000a1', 'm1@x.test', 'Member 1',  '1985-01-01', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'm2@x.test', 'Member 2',  '1985-01-01', now()),
  ('00000000-0000-0000-0000-0000000000e1', 'e1@x.test', 'No-show',   '1985-01-01', now());
insert into memberships (member_id, tier_code, status) values
  ('00000000-0000-0000-0000-0000000000f1', 'founding', 'active'),
  ('00000000-0000-0000-0000-0000000000f2', 'founding', 'active'),
  ('00000000-0000-0000-0000-0000000000f3', 'founding', 'active'),
  ('00000000-0000-0000-0000-0000000000a1', 'member',   'active'),
  ('00000000-0000-0000-0000-0000000000a2', 'member',   'active'),
  ('00000000-0000-0000-0000-0000000000e1', 'member',   'active');

insert into products (id, brewery, name, package) values
  ('00000000-0000-0000-0000-00000000b001', 'Test Brewing', 'West Coast IPA', '4-pack 16oz cans'),
  ('00000000-0000-0000-0000-00000000b002', 'Test Brewing', 'Barrel-Aged Stout', '500ml bottle'),
  ('00000000-0000-0000-0000-00000000b003', 'Test Brewing', 'Old Drop', 'can');

-- Two recent no-shows for E on an old drop.
insert into drops (id, title, slug, status, reservation_opens_at, reservation_closes_at) values
  ('00000000-0000-0000-0000-00000000d000', 'Old', 'old', 'complete', now() - interval '60 days', now() - interval '50 days');
insert into drop_items (id, drop_id, product_id, planned_qty, received_qty, price_cents) values
  ('00000000-0000-0000-0000-00000000c000', '00000000-0000-0000-0000-00000000d000',
   '00000000-0000-0000-0000-00000000b003', 10, 10, 500);
insert into reservations (drop_item_id, member_id, qty, status, tier_code, forfeited_at) values
  ('00000000-0000-0000-0000-00000000c000', '00000000-0000-0000-0000-0000000000e1', 1, 'forfeited', 'member', now() - interval '40 days');
insert into drops (id, title, slug, status, reservation_opens_at, reservation_closes_at) values
  ('00000000-0000-0000-0000-00000000d009', 'Old 2', 'old-2', 'complete', now() - interval '30 days', now() - interval '20 days');
insert into drop_items (id, drop_id, product_id, planned_qty, received_qty, price_cents) values
  ('00000000-0000-0000-0000-00000000c009', '00000000-0000-0000-0000-00000000d009',
   '00000000-0000-0000-0000-00000000b003', 10, 10, 500);
insert into reservations (drop_item_id, member_id, qty, status, tier_code, forfeited_at) values
  ('00000000-0000-0000-0000-00000000c009', '00000000-0000-0000-0000-0000000000e1', 1, 'forfeited', 'member', now() - interval '10 days');

-- Standard drop: public open in 36h → Founding window now, members in 12h.
insert into drops (id, title, slug, status, reservation_opens_at, reservation_closes_at) values
  ('00000000-0000-0000-0000-00000000d001', 'Standard', 'standard', 'announced',
   now() + interval '36 hours', now() + interval '7 days');
insert into drop_items (id, drop_id, product_id, planned_qty, price_cents) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000d001',
   '00000000-0000-0000-0000-00000000b001', 4, 2400);

-- Founding guarantee ---------------------------------------------------------
select pg_temp.assert_eq(
  (select guarantee_covered from drop_item_allocation_status
    where drop_item_id = '00000000-0000-0000-0000-00000000c001'),
  true, 'drop sized to cover every Founding member');

select pg_temp.assert_eq(
  (reserve('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c001', 2)).status,
  'allocated'::reservation_status, 'founder takes 2 while 2 remain for the other founders');

select pg_temp.assert_raises(
  $$select reserve('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000c001', 2)$$,
  'up to 1 so every Founding member gets one', 'founder cannot take the last founder''s guaranteed unit');

select pg_temp.assert_eq(
  (reserve('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000c001', 1)).status,
  'allocated'::reservation_status, 'second founder gets one');
select pg_temp.assert_eq(
  (reserve('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-00000000c001', 1)).status,
  'allocated'::reservation_status, 'third founder still gets the guaranteed unit');

select pg_temp.assert_raises(
  $$select reserve('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000c001', 1)$$,
  'reservations open for you at', 'members wait for their window');

-- Member window opens (public open in 12h).
update drops set reservation_opens_at = now() + interval '12 hours' where slug = 'standard';

select pg_temp.assert_raises(
  $$select reserve('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000c001', 1)$$,
  'reservations open for you at', 'member with 2 no-shows loses early access');

select pg_temp.assert_eq(
  (reserve('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000c001', 1)).status,
  'waitlisted'::reservation_status, 'member waitlisted once founders hold every unit');

-- Charge, ready, forfeit ------------------------------------------------------
select pg_temp.assert_raises(
  $$select record_charge((select id from reservations where member_id = '00000000-0000-0000-0000-0000000000f1'
                           and drop_item_id = '00000000-0000-0000-0000-00000000c001'), 'pi_test')$$,
  'must be received', 'no charge before the beer arrives');

select receive_drop_item('00000000-0000-0000-0000-00000000c001', 4);
select pg_temp.assert_eq(
  (record_charge((select id from reservations where member_id = '00000000-0000-0000-0000-0000000000f1'
                   and drop_item_id = '00000000-0000-0000-0000-00000000c001'), 'pi_test')).status,
  'ready'::reservation_status, 'charged on arrival and ready for pickup');

select pg_temp.assert_eq(forfeit_unclaimed('00000000-0000-0000-0000-00000000c001'), 0,
  'nothing forfeited inside the 7-day hold');

update reservations set ready_at = now() - interval '8 days'
 where member_id = '00000000-0000-0000-0000-0000000000f1' and drop_item_id = '00000000-0000-0000-0000-00000000c001';
select pg_temp.assert_eq(forfeit_unclaimed('00000000-0000-0000-0000-00000000c001'), 2,
  'unclaimed order forfeited after the hold');
select pg_temp.assert_eq(
  (select refund_due_cents from reservations
    where member_id = '00000000-0000-0000-0000-0000000000f1' and drop_item_id = '00000000-0000-0000-0000-00000000c001'),
  4320, 'forfeit refunds 90% (2 x $24.00)');
select pg_temp.assert_eq(
  (select status from reservations
    where member_id = '00000000-0000-0000-0000-0000000000a1' and drop_item_id = '00000000-0000-0000-0000-00000000c001'),
  'allocated'::reservation_status, 'forfeited units go to the waitlist');
select pg_temp.assert_eq(
  (select sum(qty_delta)::int from inventory_ledger where drop_item_id = '00000000-0000-0000-0000-00000000c001'),
  (select allocated_qty from drop_items where id = '00000000-0000-0000-0000-00000000c001'),
  'ledger reconciles after forfeit');

-- Draw drop ---------------------------------------------------------------------
insert into drops (id, title, slug, status, allocation_mode, reservation_opens_at, reservation_closes_at) values
  ('00000000-0000-0000-0000-00000000d002', 'Limited', 'limited', 'open', 'draw',
   now() - interval '1 day', now() + interval '1 day');
insert into drop_items (id, drop_id, product_id, planned_qty, price_cents) values
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000d002',
   '00000000-0000-0000-0000-00000000b002', 2, 3500);

select pg_temp.assert_raises(
  $$select reserve('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c002', 2)$$,
  'limit is 1', 'draw drops are one per member');

select pg_temp.assert_eq(
  (reserve('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000c002', 1)).status,
  'entered'::reservation_status, 'penalized member can still enter');
select reserve('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000c002', 1);
select reserve('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000c002', 1);
select reserve('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000c002', 1);

select pg_temp.assert_eq(
  (select allocated_qty from drop_items where id = '00000000-0000-0000-0000-00000000c002'),
  0, 'entries hold no stock before the draw');
select pg_temp.assert_raises(
  $$select run_draw('00000000-0000-0000-0000-00000000d002', 0.42)$$,
  'after reservations close', 'draw waits for the window to close');

update drops set reservation_closes_at = now() - interval '1 minute' where slug = 'limited';
select pg_temp.assert_eq(run_draw('00000000-0000-0000-0000-00000000d002', 0.42), 2, 'draw allocates the 2 units');

select pg_temp.assert_eq(
  (select draw_rank from reservations
    where member_id = '00000000-0000-0000-0000-0000000000f2' and drop_item_id = '00000000-0000-0000-0000-00000000c002'),
  1, 'founder drawn first');
select pg_temp.assert_eq(
  (select status from reservations
    where member_id = '00000000-0000-0000-0000-0000000000f2' and drop_item_id = '00000000-0000-0000-0000-00000000c002'),
  'allocated'::reservation_status, 'founder wins');
select pg_temp.assert_eq(
  (select draw_rank from reservations
    where member_id = '00000000-0000-0000-0000-0000000000e1' and drop_item_id = '00000000-0000-0000-0000-00000000c002'),
  4, 'member with 2 no-shows drawn last');
select pg_temp.assert_eq(
  (select count(*)::int from reservations
    where drop_item_id = '00000000-0000-0000-0000-00000000c002' and status = 'waitlisted'),
  2, 'non-winners waitlisted in draw order');
select pg_temp.assert_eq(
  (select draw_seed from drops where slug = 'limited'), 0.42::double precision, 'draw seed recorded for audit');
-- Anyone can re-derive the draw from the stored seed: seed, then walk the
-- entries in id order and draw one random key each.
create temp table recomputed (id uuid, key double precision);
do $$
declare e record;
begin
  perform setseed((select draw_seed from drops where slug = 'limited'));
  for e in select id, member_id from reservations
            where drop_item_id = '00000000-0000-0000-0000-00000000c002' and draw_key is not null
            order by id
  loop
    insert into recomputed values (e.id, power(random(), 1.0 + member_no_shows(e.member_id)));
  end loop;
end $$;
select pg_temp.assert_eq(
  (select count(*)::int from recomputed c join reservations r on r.id = c.id where r.draw_key = c.key),
  4, 'draw keys reproducible from the stored seed');

select pg_temp.assert_raises(
  $$select run_draw('00000000-0000-0000-0000-00000000d002')$$,
  'already run', 'a draw runs once');

-- Cancelling a winner promotes the next member by draw rank.
select cancel_reservation(
  (select id from reservations where member_id = '00000000-0000-0000-0000-0000000000f2'
     and drop_item_id = '00000000-0000-0000-0000-00000000c002'));
select pg_temp.assert_eq(
  (select status from reservations where drop_item_id = '00000000-0000-0000-0000-00000000c002' and draw_rank = 3),
  'allocated'::reservation_status, 'next in draw order promoted');
select pg_temp.assert_eq(
  (select status from reservations
    where member_id = '00000000-0000-0000-0000-0000000000e1' and drop_item_id = '00000000-0000-0000-0000-00000000c002'),
  'waitlisted'::reservation_status, 'penalized member stays at the back');

-- Access ---------------------------------------------------------------------------
select pg_temp.assert_eq(
  has_function_privilege('anon', 'run_draw(uuid, double precision)', 'execute')
  or has_function_privilege('authenticated', 'record_charge(uuid, text)', 'execute')
  or has_function_privilege('anon', 'forfeit_unclaimed(uuid)', 'execute')
  or has_function_privilege('authenticated', 'member_no_shows(uuid)', 'execute'),
  false, 'API roles cannot execute the new functions');

\echo 'All allocation rule tests passed.'
