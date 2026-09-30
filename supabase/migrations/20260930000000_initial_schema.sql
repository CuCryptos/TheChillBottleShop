-- The Chill Bottle Shop — initial schema
-- Members, tiers, Von Oster purchase orders, drops, reservations/allocations,
-- fulfillment, and an inventory ledger. Allocation rules live in SQL functions
-- so overselling is impossible no matter which client calls them.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type membership_status  as enum ('pending', 'active', 'past_due', 'cancelled', 'expired');
create type po_status          as enum ('draft', 'submitted', 'confirmed', 'shipped', 'received', 'cancelled');
create type drop_status        as enum ('draft', 'announced', 'open', 'closed', 'inbound', 'received', 'fulfilling', 'complete', 'cancelled');
create type reservation_status as enum ('allocated', 'waitlisted', 'charged', 'ready', 'fulfilled', 'cancelled', 'forfeited');
create type fulfillment_method as enum ('pickup', 'delivery');

-- ---------------------------------------------------------------------------
-- Members & membership
-- ---------------------------------------------------------------------------
create table membership_tiers (
  code                       text primary key,
  name                       text not null,
  annual_fee_cents           integer not null check (annual_fee_cents >= 0),
  priority                   integer not null,               -- lower = earlier access
  early_access_hours         integer not null default 0 check (early_access_hours >= 0),
  default_per_item_limit     integer not null default 1 check (default_per_item_limit > 0),
  max_members                integer check (max_members > 0), -- e.g. cap on Founding members
  stripe_price_id            text
);

create table members (
  id                         uuid primary key default gen_random_uuid(),
  auth_user_id               uuid unique,                    -- Supabase auth.users.id
  email                      text not null unique,
  full_name                  text not null,
  phone                      text,
  date_of_birth              date not null,
  address_line1              text,
  address_line2              text,
  city                       text,
  state                      text not null default 'HI',
  postal_code                text,
  id_verified_at             timestamptz,
  id_verification_ref        text,                           -- provider session id, never the ID image
  stripe_customer_id         text unique,
  created_at                 timestamptz not null default now(),
  constraint members_21_plus check (date_of_birth <= (current_date - interval '21 years')),
  constraint members_hawaii  check (state = 'HI')
);

create table memberships (
  id                         uuid primary key default gen_random_uuid(),
  member_id                  uuid not null references members(id) on delete cascade,
  tier_code                  text not null references membership_tiers(code),
  status                     membership_status not null default 'pending',
  starts_at                  timestamptz not null default now(),
  ends_at                    timestamptz,
  stripe_subscription_id     text unique,
  created_at                 timestamptz not null default now()
);
-- At most one live membership per member.
create unique index memberships_one_live
  on memberships(member_id) where status in ('pending', 'active', 'past_due');

-- ---------------------------------------------------------------------------
-- Catalog & purchasing from Von Oster Beverage Co
-- ---------------------------------------------------------------------------
create table products (
  id                         uuid primary key default gen_random_uuid(),
  brewery                    text not null,
  name                       text not null,
  style                      text,
  abv                        numeric(4,2),
  package                    text not null,                  -- e.g. '4-pack 16oz cans'
  description                text,
  image_url                  text,
  hopgrail_url               text,                           -- review/story on hopgrail.com
  created_at                 timestamptz not null default now()
);

create table purchase_orders (
  id                         uuid primary key default gen_random_uuid(),
  po_number                  text not null unique,
  supplier                   text not null default 'Von Oster Beverage Co',
  status                     po_status not null default 'draft',
  submitted_at               timestamptz,
  expected_arrival           date,
  received_at                timestamptz,
  invoice_number             text,
  invoice_date               date,
  invoice_total_cents        integer check (invoice_total_cents >= 0),
  paid_at                    timestamptz,
  created_at                 timestamptz not null default now()
);

-- HRS §281-42: wholesaler credit may not exceed 30 days from invoice date.
create view purchase_orders_payment_due as
select po.id, po.po_number, po.invoice_number, po.invoice_date, po.invoice_total_cents,
       po.invoice_date + 30                    as pay_by,
       (po.invoice_date + 30) - current_date   as days_remaining
from purchase_orders po
where po.invoice_date is not null and po.paid_at is null
order by pay_by;

-- ---------------------------------------------------------------------------
-- Drops
-- ---------------------------------------------------------------------------
create table drops (
  id                         uuid primary key default gen_random_uuid(),
  title                      text not null,
  slug                       text not null unique,
  status                     drop_status not null default 'draft',
  purchase_order_id          uuid references purchase_orders(id),
  reservation_opens_at       timestamptz not null,
  reservation_closes_at      timestamptz not null,
  pickup_starts_at           timestamptz,
  pickup_ends_at             timestamptz,
  created_at                 timestamptz not null default now(),
  constraint drops_window check (reservation_closes_at > reservation_opens_at),
  constraint drops_pickup check (pickup_ends_at is null or pickup_ends_at > pickup_starts_at)
);

create table drop_items (
  id                         uuid primary key default gen_random_uuid(),
  drop_id                    uuid not null references drops(id) on delete cascade,
  product_id                 uuid not null references products(id),
  planned_qty                integer not null check (planned_qty >= 0),   -- units on the PO
  received_qty               integer check (received_qty >= 0),           -- set on arrival
  allocated_qty              integer not null default 0 check (allocated_qty >= 0),
  price_cents                integer not null check (price_cents >= 0),
  per_member_limit           integer check (per_member_limit > 0),        -- overrides tier default
  unique (drop_id, product_id),
  constraint drop_items_no_oversell
    check (allocated_qty <= coalesce(received_qty, planned_qty))
);

-- ---------------------------------------------------------------------------
-- Reservations (a member's claim on units of a drop item)
-- ---------------------------------------------------------------------------
create table reservations (
  id                         uuid primary key default gen_random_uuid(),
  drop_item_id               uuid not null references drop_items(id) on delete cascade,
  member_id                  uuid not null references members(id),
  qty                        integer not null check (qty > 0),
  status                     reservation_status not null,
  tier_code                  text not null references membership_tiers(code), -- tier at time of reservation
  requested_at               timestamptz not null default clock_timestamp(),
  allocated_at               timestamptz,
  stripe_payment_method_id   text,                           -- saved via SetupIntent, charged on arrival
  stripe_payment_intent_id   text,
  charged_at                 timestamptz,
  cancelled_reason           text,
  unique (drop_item_id, member_id)
);
create index reservations_waitlist on reservations(drop_item_id, requested_at) where status = 'waitlisted';
create index reservations_member   on reservations(member_id);

-- ---------------------------------------------------------------------------
-- Fulfillment (pickup or delivery hand-off with ID check)
-- ---------------------------------------------------------------------------
create table fulfillments (
  id                         uuid primary key default gen_random_uuid(),
  member_id                  uuid not null references members(id),
  drop_id                    uuid not null references drops(id),
  method                     fulfillment_method not null default 'pickup',
  delivery_address           text,
  scheduled_for              timestamptz,
  handed_off_at              timestamptz,
  handed_off_by              text,                           -- staff member / driver
  recipient_name             text,
  recipient_id_checked       boolean not null default false,
  recipient_signature_ref    text,                           -- stored signature image key
  unique (member_id, drop_id),
  constraint fulfillments_delivery_address check (method = 'pickup' or delivery_address is not null),
  constraint fulfillments_id_checked check (handed_off_at is null or recipient_id_checked)
);

-- ---------------------------------------------------------------------------
-- Inventory ledger (append-only audit trail of every unit movement)
-- ---------------------------------------------------------------------------
create table inventory_ledger (
  id                         bigint generated always as identity primary key,
  drop_item_id               uuid not null references drop_items(id) on delete cascade,
  reservation_id             uuid references reservations(id) on delete set null,
  event                      text not null,                  -- allocate, waitlist, release, receive, shortfall, promote, fulfill, forfeit
  qty_delta                  integer not null,               -- change to allocated_qty
  note                       text,
  created_at                 timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
create view drop_item_allocation_status as
select di.id as drop_item_id, d.id as drop_id, d.title as drop_title, d.status as drop_status,
       p.brewery, p.name as product_name,
       di.planned_qty, di.received_qty, di.allocated_qty,
       coalesce(di.received_qty, di.planned_qty) - di.allocated_qty          as unallocated_qty,
       coalesce(sum(r.qty) filter (where r.status = 'waitlisted'), 0)::int as waitlisted_qty,
       di.allocated_qty = coalesce(di.received_qty, di.planned_qty)        as fully_allocated
from drop_items di
join drops d    on d.id = di.drop_id
join products p on p.id = di.product_id
left join reservations r on r.drop_item_id = di.id
group by di.id, d.id, p.id;

-- ---------------------------------------------------------------------------
-- Allocation functions
-- ---------------------------------------------------------------------------

-- Live tier for a member, or null if they have no active membership.
create function member_active_tier(p_member_id uuid)
returns membership_tiers
language sql stable as $$
  select t.* from memberships m
  join membership_tiers t on t.code = m.tier_code
  where m.member_id = p_member_id
    and m.status = 'active'
    and m.starts_at <= now()
    and (m.ends_at is null or m.ends_at > now())
  limit 1;
$$;

-- Reserve units of a drop item. Allocates if units remain, otherwise waitlists.
-- Row-locks the drop item so concurrent reservations can't oversell.
create function reserve(p_member_id uuid, p_drop_item_id uuid, p_qty integer,
                        p_payment_method_id text default null)
returns reservations
language plpgsql as $$
declare
  v_member  members;
  v_tier    membership_tiers;
  v_item    drop_items;
  v_drop    drops;
  v_limit   integer;
  v_avail   integer;
  v_res     reservations;
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
  if now() < v_drop.reservation_opens_at - make_interval(hours => v_tier.early_access_hours) then
    raise exception 'reservations open for your tier at %',
      v_drop.reservation_opens_at - make_interval(hours => v_tier.early_access_hours);
  end if;
  if now() >= v_drop.reservation_closes_at then
    raise exception 'reservations for this drop have closed';
  end if;

  v_limit := coalesce(v_item.per_member_limit, v_tier.default_per_item_limit);
  if p_qty > v_limit then
    raise exception 'limit is % per member for this item', v_limit;
  end if;

  if exists (select 1 from reservations
             where drop_item_id = p_drop_item_id and member_id = p_member_id
               and status not in ('cancelled', 'forfeited')) then
    raise exception 'you already have a reservation for this item';
  end if;
  -- A previously cancelled reservation is replaced by the new one.
  delete from reservations
   where drop_item_id = p_drop_item_id and member_id = p_member_id
     and status in ('cancelled', 'forfeited');

  v_avail := coalesce(v_item.received_qty, v_item.planned_qty) - v_item.allocated_qty;

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

-- Fill freed units from the waitlist, oldest request first. Skips a waitlisted
-- request that is larger than the units available (no partial fills).
create function promote_waitlist(p_drop_item_id uuid)
returns integer
language plpgsql as $$
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
     order by requested_at, id
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

-- Member or staff cancels an allocated/waitlisted reservation before it is charged.
create function cancel_reservation(p_reservation_id uuid, p_reason text default 'member cancelled')
returns reservations
language plpgsql as $$
declare
  v_res reservations;
begin
  select * into v_res from reservations where id = p_reservation_id;
  if not found then raise exception 'reservation not found'; end if;
  perform 1 from drop_items where id = v_res.drop_item_id for update;
  select * into v_res from reservations where id = p_reservation_id for update;

  if v_res.status not in ('allocated', 'waitlisted') then
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

-- Record the count that actually arrived from Von Oster and reconcile.
-- Short shipment: newest allocations go back to the waitlist first.
-- Over shipment: waitlisted members are promoted, oldest first.
create function receive_drop_item(p_drop_item_id uuid, p_received_qty integer)
returns drop_items
language plpgsql as $$
declare
  v_item drop_items;
  v_over integer;
  r      reservations;
begin
  if p_received_qty is null or p_received_qty < 0 then
    raise exception 'received quantity must be zero or more';
  end if;

  select * into v_item from drop_items where id = p_drop_item_id for update;
  if not found then raise exception 'drop item not found'; end if;
  if v_item.received_qty is not null then
    raise exception 'drop item already received';
  end if;

  v_over := v_item.allocated_qty - p_received_qty;

  -- Bump newest allocations until what's allocated fits what arrived.
  for r in
    select * from reservations
     where drop_item_id = p_drop_item_id and status = 'allocated'
     order by allocated_at desc, requested_at desc, id desc
     for update
  loop
    exit when v_over <= 0;
    update reservations
       set status = 'waitlisted', allocated_at = null,
           cancelled_reason = 'short shipment from supplier'
     where id = r.id;
    insert into inventory_ledger (drop_item_id, reservation_id, event, qty_delta, note)
    values (p_drop_item_id, r.id, 'shortfall', -r.qty, 'short shipment from supplier');
    v_item.allocated_qty := v_item.allocated_qty - r.qty;
    v_over := v_over - r.qty;
  end loop;

  update drop_items
     set received_qty = p_received_qty, allocated_qty = v_item.allocated_qty
   where id = p_drop_item_id;
  insert into inventory_ledger (drop_item_id, event, qty_delta, note)
  values (p_drop_item_id, 'receive', 0,
          format('planned %s, received %s', v_item.planned_qty, p_received_qty));

  perform promote_waitlist(p_drop_item_id);

  select * into v_item from drop_items where id = p_drop_item_id;
  return v_item;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security (Supabase). Members read their own data; all writes to
-- allocation state go through the functions above via server-side code using
-- the service role.
-- ---------------------------------------------------------------------------
alter table members          enable row level security;
alter table memberships      enable row level security;
alter table reservations     enable row level security;
alter table fulfillments     enable row level security;
alter table membership_tiers enable row level security;
alter table products         enable row level security;
alter table drops            enable row level security;
alter table drop_items       enable row level security;
alter table purchase_orders  enable row level security;
alter table inventory_ledger enable row level security;

create policy members_self_read on members
  for select using (auth_user_id = auth.uid());
create policy memberships_self_read on memberships
  for select using (member_id in (select id from members where auth_user_id = auth.uid()));
create policy reservations_self_read on reservations
  for select using (member_id in (select id from members where auth_user_id = auth.uid()));
create policy fulfillments_self_read on fulfillments
  for select using (member_id in (select id from members where auth_user_id = auth.uid()));

create policy tiers_public_read      on membership_tiers for select using (true);
create policy products_public_read   on products         for select using (true);
create policy drops_public_read      on drops            for select using (status <> 'draft');
create policy drop_items_public_read on drop_items
  for select using (drop_id in (select id from drops where status <> 'draft'));
-- purchase_orders and inventory_ledger: no policies → service role only.

-- Views run with the caller's permissions, so RLS on the base tables applies.
alter view drop_item_allocation_status  set (security_invoker = true);
alter view purchase_orders_payment_due  set (security_invoker = true);

-- Allocation functions are called from trusted server code only.
revoke execute on function reserve(uuid, uuid, integer, text)  from public;
revoke execute on function promote_waitlist(uuid)              from public;
revoke execute on function cancel_reservation(uuid, text)      from public;
revoke execute on function receive_drop_item(uuid, integer)    from public;

-- ---------------------------------------------------------------------------
-- Seed tiers (placeholder pricing — adjust before launch)
-- ---------------------------------------------------------------------------
insert into membership_tiers (code, name, annual_fee_cents, priority, early_access_hours, default_per_item_limit, max_members)
values ('founding', 'Founding Member', 15000, 1, 48, 2, 100),
       ('member',   'Member',           7500, 2, 24, 1, null);
