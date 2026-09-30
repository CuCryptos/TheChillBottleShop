-- Finance: operating expenses, a monthly budget, and P&L actuals computed from
-- real activity (cash basis, Hawaiʻi months). Line slugs match lib/pnl-lines.ts
-- and the P&L spreadsheet. Hawaiʻi GET is collected on top of prices and is not
-- revenue, so it never appears here. Service role only: no RLS policies.

create table expenses (
  id            uuid primary key default gen_random_uuid(),
  incurred_on   date not null,
  category      text not null check (category in (
                  'rent', 'utilities', 'payroll', 'insurance', 'licenses', 'software',
                  'payment_processing', 'marketing', 'professional_fees', 'delivery',
                  'supplies', 'other_opex')),
  vendor        text,
  description   text,
  amount_cents  integer not null check (amount_cents >= 0),
  created_at    timestamptz not null default now()
);
create index expenses_incurred_on on expenses (incurred_on);

create table budget_lines (
  month         date not null check (extract(day from month) = 1),
  line          text not null check (line in (
                  'beer_sales', 'refunds', 'membership_fees',
                  'beer_cogs',
                  'rent', 'utilities', 'payroll', 'insurance', 'licenses', 'software',
                  'payment_processing', 'marketing', 'professional_fees', 'delivery',
                  'supplies', 'other_opex',
                  'depreciation', 'interest')),
  amount_cents  integer not null,
  unique (month, line)
);

alter table expenses     enable row level security;
alter table budget_lines enable row level security;
revoke all on expenses, budget_lines from anon, authenticated;

-- Months are Hawaiʻi calendar months. Revenue is recognized when a card is
-- charged (on arrival), refunds when an order is forfeited, membership fees at
-- the start of the membership, beer cost on the Von Oster invoice date.
create view pnl_actuals_monthly as
with entries (month, line, amount_cents) as (
  select date_trunc('month', r.charged_at at time zone 'Pacific/Honolulu')::date,
         'beer_sales', di.price_cents::bigint * r.qty
    from reservations r
    join drop_items di on di.id = r.drop_item_id
   where r.charged_at is not null
  union all
  select date_trunc('month', r.forfeited_at at time zone 'Pacific/Honolulu')::date,
         'refunds', -r.refund_due_cents::bigint
    from reservations r
   where r.forfeited_at is not null and r.refund_due_cents is not null
  union all
  select date_trunc('month', m.starts_at at time zone 'Pacific/Honolulu')::date,
         'membership_fees', t.annual_fee_cents::bigint
    from memberships m
    join membership_tiers t on t.code = m.tier_code
   where m.status in ('active', 'past_due', 'expired', 'cancelled')
  union all
  select date_trunc('month', po.invoice_date)::date, 'beer_cogs', po.invoice_total_cents::bigint
    from purchase_orders po
   where po.invoice_date is not null and po.invoice_total_cents is not null
  union all
  select date_trunc('month', e.incurred_on)::date, e.category, e.amount_cents::bigint
    from expenses e
)
select month, line, sum(amount_cents)::bigint as amount_cents
  from entries
 group by month, line;

alter view pnl_actuals_monthly set (security_invoker = true);
revoke select on pnl_actuals_monthly from anon, authenticated;

-- ---------------------------------------------------------------------------
-- waitlist_ranked was created with w.*, which Postgres expands when the view is
-- created, so it never picked up confirmation_sent_at (added later). Re-create
-- it with that column appended (existing columns keep their order).
-- ---------------------------------------------------------------------------
create or replace view waitlist_ranked as
select w.id, w.email, w.first_name, w.date_of_birth, w.island, w.postal_code, w.wants_founding,
       w.heard_from, w.referral_code, w.referred_by_code, w.email_consent_at, w.created_at,
       w.converted_member_id,
       (select count(*) from waitlist_signups r where r.referred_by_code = w.referral_code)::int as referrals,
       w.confirmation_sent_at
from waitlist_signups w
order by wants_founding desc, referrals desc, created_at;
alter view waitlist_ranked set (security_invoker = true);
