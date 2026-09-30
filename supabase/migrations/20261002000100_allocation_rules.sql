-- Allocation rules from the September 2026 market research
-- (reports/Beer drop market research Hawaii.md):
--   * Founding members get a guaranteed unit of every standard drop they
--     reserve during their exclusive window.
--   * Limited drops use a reservation window followed by a random draw:
--     guaranteed tiers first, weighted by pickup history, one per member.
--   * Ready orders are held for a pickup window, then forfeited with a partial
--     refund and returned to the waitlist.
--   * Repeated no-shows lose early access and go to the back of draws.

-- ---------------------------------------------------------------------------
-- Policy knobs (single row, editable without a migration)
-- ---------------------------------------------------------------------------
create table allocation_policy (
  id                   boolean primary key default true check (id),
  forfeit_refund_pct   integer  not null default 90 check (forfeit_refund_pct between 0 and 100),
  no_show_limit        integer  not null default 2 check (no_show_limit > 0),
  no_show_window       interval not null default interval '365 days'
);
insert into allocation_policy default values;
alter table allocation_policy enable row level security;

-- ---------------------------------------------------------------------------
-- Schema additions
-- ---------------------------------------------------------------------------
create type allocation_mode as enum ('first_come', 'draw');

alter table membership_tiers
  add column guaranteed_allocation boolean not null default false;
update membership_tiers set guaranteed_allocation = true where code = 'founding';

alter table drops
  add column allocation_mode  allocation_mode not null default 'first_come',
  add column pickup_hold_days integer not null default 7 check (pickup_hold_days > 0),
  add column draw_seed        double precision check (draw_seed between -1 and 1),
  add column drawn_at         timestamptz;

alter table reservations
  add column draw_key          double precision,   -- random key used in the draw (audit)
  add column draw_rank         integer,            -- 1 = first pick; also orders the post-draw waitlist
  add column ready_at          timestamptz,        -- charged and ready for pickup/delivery
  add column forfeited_at      timestamptz,
  add column refund_due_cents  integer check (refund_due_cents >= 0);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Forfeited (unclaimed) orders inside the policy window.
create function member_no_shows(p_member_id uuid)
returns integer
language plpgsql stable
set search_path = public as $$
declare
  v_window interval;
  v_count  integer;
begin
  select no_show_window into v_window from allocation_policy;
  select count(*) into v_count from reservations
   where member_id = p_member_id and status = 'forfeited'
     and forfeited_at > now() - v_window;
  return v_count;
end;
$$;

create function member_is_penalized(p_member_id uuid)
returns boolean
language plpgsql stable
set search_path = public as $$
begin
  return member_no_shows(p_member_id) >= (select no_show_limit from allocation_policy);
end;
$$;

-- Active members of tiers with a guaranteed allocation.
create function guaranteed_member_count()
returns integer
language plpgsql stable
set search_path = public as $$
begin
  return (select count(*) from memberships m
            join membership_tiers t on t.code = m.tier_code
           where t.guaranteed_allocation and m.status = 'active'
             and m.starts_at <= now() and (m.ends_at is null or m.ends_at > now()));
end;
$$;

-- ---------------------------------------------------------------------------
-- reserve(): first-come drops allocate or waitlist; draw drops take an entry.
-- ---------------------------------------------------------------------------
create or replace function reserve(p_member_id uuid, p_drop_item_id uuid, p_qty integer,
                                   p_payment_method_id text default null)
returns reservations
language plpgsql
set search_path = public as $$
declare
  v_member     members;
  v_tier       membership_tiers;
  v_item       drop_items;
  v_drop       drops;
  v_early      integer;
  v_opens_for  timestamptz;
  v_excl_end   timestamptz;
  v_limit      integer;
  v_avail      integer;
  v_floor      integer;
  v_res        reservations;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'quantity must be positive';
  end if;

  select * into v_member from members where id = p_member_id;
  if not found then raise exception 'member not found'; end if;
  if v_member.id_verified_at is null then
    raise exception 'ID verification required before reserving';
  end if;

  v_tier := member_active_tier(p_member_id);
  if v_tier.code is null then raise exception 'active membership required'; end if;

  select * into v_item from drop_items where id = p_drop_item_id for update;
  if not found then raise exception 'drop item not found'; end if;
  select * into v_drop from drops where id = v_item.drop_id;

  if v_drop.status not in ('announced', 'open') then
    raise exception 'reservations are not open for this drop';
  end if;

  -- Repeated no-shows lose early access.
  v_early := case when member_is_penalized(p_member_id) then 0 else v_tier.early_access_hours end;
  v_opens_for := v_drop.reservation_opens_at - make_interval(hours => v_early);
  if now() < v_opens_for then
    raise exception 'reservations open for you at %', v_opens_for;
  end if;
  if now() >= v_drop.reservation_closes_at then
    raise exception 'reservations for this drop have closed';
  end if;

  if v_drop.allocation_mode = 'draw' then
    v_limit := 1;   -- one entry, one unit, per member per item
  else
    v_limit := coalesce(v_item.per_member_limit, v_tier.default_per_item_limit);
  end if;
  if p_qty > v_limit then
    raise exception 'limit is % per member for this item', v_limit;
  end if;

  if exists (select 1 from reservations
             where drop_item_id = p_drop_item_id and member_id = p_member_id
               and status not in ('cancelled', 'forfeited')) then
    raise exception 'you already have a reservation for this item';
  end if;
  delete from reservations
   where drop_item_id = p_drop_item_id and member_id = p_member_id
     and status in ('cancelled', 'forfeited');

  -- Draw drops: record the entry; the draw allocates after the window closes.
  if v_drop.allocation_mode = 'draw' then
    insert into reservations (drop_item_id, member_id, qty, status, tier_code, stripe_payment_method_id)
    values (p_drop_item_id, p_member_id, p_qty, 'entered', v_tier.code, p_payment_method_id)
    returning * into v_res;
    insert into inventory_ledger (drop_item_id, reservation_id, event, qty_delta)
    values (p_drop_item_id, v_res.id, 'enter', 0);
    return v_res;
  end if;

  v_avail := coalesce(v_item.received_qty, v_item.planned_qty) - v_item.allocated_qty;

  -- Founding guarantee: during the guaranteed tiers' exclusive window, leave at
  -- least one unit for every guaranteed member who hasn't reserved yet.
  select v_drop.reservation_opens_at - make_interval(hours => coalesce(max(early_access_hours), 0))
    into v_excl_end
    from membership_tiers where not guaranteed_allocation;
  if v_tier.guaranteed_allocation and now() < v_excl_end and v_early > 0 then
    select count(*) into v_floor
      from memberships m
      join membership_tiers t on t.code = m.tier_code
     where t.guaranteed_allocation and m.status = 'active'
       and m.starts_at <= now() and (m.ends_at is null or m.ends_at > now())
       and m.member_id <> p_member_id
       and not member_is_penalized(m.member_id)
       and not exists (select 1 from reservations r
                        where r.drop_item_id = p_drop_item_id and r.member_id = m.member_id
                          and r.status not in ('cancelled', 'forfeited'));
    if v_avail - p_qty < v_floor and v_avail - v_floor >= 1 then
      raise exception 'during the Founding window you can reserve up to % so every Founding member gets one',
        v_avail - v_floor;
    end if;
  end if;

  if v_avail >= p_qty then
    insert into reservations (drop_item_id, member_id, qty, status, tier_code,
                              allocated_at, stripe_payment_method_id)
    values (p_drop_item_id, p_member_id, p_qty, 'allocated', v_tier.code,
            now(), p_payment_method_id)
    returning * into v_res;
    update drop_items set allocated_qty = allocated_qty + p_qty where id = p_drop_item_id;
    insert into inventory_ledger (drop_item_id, reservation_id, event, qty_delta)
    values (p_drop_item_id, v_res.id, 'allocate', p_qty);
  else
    insert into reservations (drop_item_id, member_id, qty, status, tier_code,
                              stripe_payment_method_id)
    values (p_drop_item_id, p_member_id, p_qty, 'waitlisted', v_tier.code, p_payment_method_id)
    returning * into v_res;
    insert into inventory_ledger (drop_item_id, reservation_id, event, qty_delta)
    values (p_drop_item_id, v_res.id, 'waitlist', 0);
  end if;

  return v_res;
end;
$$;

-- ---------------------------------------------------------------------------
-- run_draw(): allocate a draw drop once its reservation window has closed.
-- Order: members in good standing before penalized ones, guaranteed tiers
-- before others, then a weighted random key (weight halves per recent no-show).
-- Winners are allocated in rank order; everyone else is waitlisted by rank.
-- The seed is stored so the result can be reproduced and audited.
-- ---------------------------------------------------------------------------
create function run_draw(p_drop_id uuid, p_seed double precision default null)
returns integer
language plpgsql
set search_path = public as $$
declare
  v_drop   drops;
  v_seed   double precision := coalesce(p_seed, random() * 2 - 1);
  v_item   drop_items;
  v_avail  integer;
  v_won    integer := 0;
  e        record;   -- not "r": that would shadow the table alias below
begin
  select * into v_drop from drops where id = p_drop_id for update;
  if not found then raise exception 'drop not found'; end if;
  if v_drop.allocation_mode <> 'draw' then raise exception 'drop is not a draw drop'; end if;
  if v_drop.drawn_at is not null then raise exception 'draw already run for this drop'; end if;
  if now() < v_drop.reservation_closes_at then
    raise exception 'the draw runs after reservations close at %', v_drop.reservation_closes_at;
  end if;

  perform setseed(v_seed);

  for v_item in select * from drop_items where drop_id = p_drop_id order by id for update loop
    -- Deterministic key assignment: iterate in id order after seeding.
    for e in select id, member_id from reservations
              where drop_item_id = v_item.id and status = 'entered'
              order by id
    loop
      update reservations
         set draw_key = power(random(), 1.0 + member_no_shows(e.member_id))
       where id = e.id;
    end loop;

    with ranked as (
      select r.id,
             row_number() over (
               order by member_is_penalized(r.member_id),
                        t.guaranteed_allocation desc,
                        r.draw_key desc,
                        r.id) as rnk
        from reservations r
        join membership_tiers t on t.code = r.tier_code
       where r.drop_item_id = v_item.id and r.status = 'entered')
    update reservations res set draw_rank = ranked.rnk
      from ranked where res.id = ranked.id;

    v_avail := coalesce(v_item.received_qty, v_item.planned_qty) - v_item.allocated_qty;
    for e in select * from reservations
              where drop_item_id = v_item.id and status = 'entered'
              order by draw_rank
    loop
      if e.qty <= v_avail then
        update reservations set status = 'allocated', allocated_at = now() where id = e.id;
        insert into inventory_ledger (drop_item_id, reservation_id, event, qty_delta, note)
        values (v_item.id, e.id, 'draw_win', e.qty, format('rank %s', e.draw_rank));
        v_avail := v_avail - e.qty;
        v_won   := v_won + e.qty;
        update drop_items set allocated_qty = allocated_qty + e.qty where id = v_item.id;
      else
        update reservations set status = 'waitlisted' where id = e.id;
        insert into inventory_ledger (drop_item_id, reservation_id, event, qty_delta, note)
        values (v_item.id, e.id, 'draw_waitlist', 0, format('rank %s', e.draw_rank));
      end if;
    end loop;
  end loop;

  update drops set draw_seed = v_seed, drawn_at = now() where id = p_drop_id;
  return v_won;
end;
$$;

-- ---------------------------------------------------------------------------
-- Waitlist order: draw rank when there is one, otherwise request time.
-- ---------------------------------------------------------------------------
create or replace function promote_waitlist(p_drop_item_id uuid)
returns integer
language plpgsql
set search_path = public as $$
declare
  v_item     drop_items;
  v_avail    integer;
  v_promoted integer := 0;
  r          reservations;
begin
  select * into v_item from drop_items where id = p_drop_item_id for update;
  v_avail := coalesce(v_item.received_qty, v_item.planned_qty) - v_item.allocated_qty;

  for r in
    select * from reservations
     where drop_item_id = p_drop_item_id and status = 'waitlisted'
     order by draw_rank nulls last, requested_at, id
     for update
  loop
    exit when v_avail <= 0;
    continue when r.qty > v_avail;
    update reservations set status = 'allocated', allocated_at = now() where id = r.id;
    insert into inventory_ledger (drop_item_id, reservation_id, event, qty_delta)
    values (p_drop_item_id, r.id, 'promote', r.qty);
    v_avail    := v_avail - r.qty;
    v_promoted := v_promoted + r.qty;
  end loop;

  update drop_items set allocated_qty = allocated_qty + v_promoted where id = p_drop_item_id;
  return v_promoted;
end;
$$;

-- Draw entries can be withdrawn before the draw, like waitlist spots.
create or replace function cancel_reservation(p_reservation_id uuid, p_reason text default 'member cancelled')
returns reservations
language plpgsql
set search_path = public as $$
declare
  v_res reservations;
begin
  select * into v_res from reservations where id = p_reservation_id;
  if not found then raise exception 'reservation not found'; end if;
  perform 1 from drop_items where id = v_res.drop_item_id for update;
  select * into v_res from reservations where id = p_reservation_id for update;

  if v_res.status not in ('entered', 'allocated', 'waitlisted') then
    raise exception 'reservation in status % cannot be cancelled', v_res.status;
  end if;

  if v_res.status = 'allocated' then
    update drop_items set allocated_qty = allocated_qty - v_res.qty where id = v_res.drop_item_id;
    insert into inventory_ledger (drop_item_id, reservation_id, event, qty_delta, note)
    values (v_res.drop_item_id, v_res.id, 'release', -v_res.qty, p_reason);
  end if;

  update reservations set status = 'cancelled', cancelled_reason = p_reason
   where id = p_reservation_id returning * into v_res;

  perform promote_waitlist(v_res.drop_item_id);
  return v_res;
end;
$$;

-- ---------------------------------------------------------------------------
-- Charge → ready → picked up, or forfeited after the hold.
-- ---------------------------------------------------------------------------

-- Server code calls this after the card-on-file charge succeeds.
create function record_charge(p_reservation_id uuid, p_payment_intent_id text)
returns reservations
language plpgsql
set search_path = public as $$
declare
  v_res  reservations;
  v_item drop_items;
begin
  select * into v_res from reservations where id = p_reservation_id for update;
  if not found then raise exception 'reservation not found'; end if;
  if v_res.status <> 'allocated' then
    raise exception 'only allocated reservations can be charged (status %)', v_res.status;
  end if;
  select * into v_item from drop_items where id = v_res.drop_item_id;
  if v_item.received_qty is null then
    raise exception 'beer must be received at the shop before charging';
  end if;
  update reservations
     set status = 'ready', stripe_payment_intent_id = p_payment_intent_id,
         charged_at = now(), ready_at = now()
   where id = p_reservation_id returning * into v_res;
  return v_res;
end;
$$;

-- Release ready orders not collected within the drop's pickup hold.
create function forfeit_unclaimed(p_drop_item_id uuid)
returns integer
language plpgsql
set search_path = public as $$
declare
  v_item drop_items;
  v_drop drops;
  v_pct  integer;
  v_freed integer := 0;
  r      reservations;
begin
  select * into v_item from drop_items where id = p_drop_item_id for update;
  if not found then raise exception 'drop item not found'; end if;
  select * into v_drop from drops where id = v_item.drop_id;
  select forfeit_refund_pct into v_pct from allocation_policy;

  for r in select * from reservations
            where drop_item_id = p_drop_item_id and status = 'ready'
              and ready_at < now() - make_interval(days => v_drop.pickup_hold_days)
            for update
  loop
    update reservations
       set status = 'forfeited', forfeited_at = now(),
           refund_due_cents = (v_item.price_cents * r.qty * v_pct) / 100
     where id = r.id;
    insert into inventory_ledger (drop_item_id, reservation_id, event, qty_delta, note)
    values (p_drop_item_id, r.id, 'forfeit', -r.qty,
            format('not collected within %s days', v_drop.pickup_hold_days));
    v_freed := v_freed + r.qty;
  end loop;

  update drop_items set allocated_qty = allocated_qty - v_freed where id = p_drop_item_id;
  perform promote_waitlist(p_drop_item_id);
  return v_freed;
end;
$$;

-- ---------------------------------------------------------------------------
-- Allocation status: add draw entries and the Founding-guarantee sizing check.
-- ---------------------------------------------------------------------------
create or replace view drop_item_allocation_status as
select di.id as drop_item_id, d.id as drop_id, d.title as drop_title, d.status as drop_status,
       p.brewery, p.name as product_name,
       di.planned_qty, di.received_qty, di.allocated_qty,
       coalesce(di.received_qty, di.planned_qty) - di.allocated_qty          as unallocated_qty,
       coalesce(sum(r.qty) filter (where r.status = 'waitlisted'), 0)::int as waitlisted_qty,
       di.allocated_qty = coalesce(di.received_qty, di.planned_qty)        as fully_allocated,
       d.allocation_mode,
       coalesce(sum(r.qty) filter (where r.status = 'entered'), 0)::int    as entered_qty,
       guaranteed_member_count()                                           as guaranteed_members,
       d.allocation_mode = 'draw'
         or coalesce(di.received_qty, di.planned_qty) >= guaranteed_member_count()
                                                                           as guarantee_covered
from drop_items di
join drops d    on d.id = di.drop_id
join products p on p.id = di.product_id
left join reservations r on r.drop_item_id = di.id
group by di.id, d.id, p.id;
alter view drop_item_allocation_status set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- Server-only access, as with the other allocation functions.
-- ---------------------------------------------------------------------------
revoke execute on function member_no_shows(uuid)                          from public, anon, authenticated;
revoke execute on function member_is_penalized(uuid)                      from public, anon, authenticated;
revoke execute on function guaranteed_member_count()                      from public, anon, authenticated;
revoke execute on function reserve(uuid, uuid, integer, text)             from public, anon, authenticated;
revoke execute on function run_draw(uuid, double precision)               from public, anon, authenticated;
revoke execute on function promote_waitlist(uuid)                         from public, anon, authenticated;
revoke execute on function cancel_reservation(uuid, text)                 from public, anon, authenticated;
revoke execute on function record_charge(uuid, text)                      from public, anon, authenticated;
revoke execute on function forfeit_unclaimed(uuid)                        from public, anon, authenticated;

-- The status view is an internal admin view (it reads membership counts).
revoke select on drop_item_allocation_status from anon, authenticated;
