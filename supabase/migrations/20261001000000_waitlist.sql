-- Pre-launch waitlist. Collects interest only; no beer is sold or reserved.
-- Written by the site's server code with the service role, so there are no
-- public RLS policies.

create type hawaii_island as enum ('oahu', 'maui', 'hawaii', 'kauai', 'molokai', 'lanai');

create table waitlist_signups (
  id                   uuid primary key default gen_random_uuid(),
  email                text not null,
  first_name           text not null,
  date_of_birth        date not null,
  island               hawaii_island not null,
  postal_code          text not null check (postal_code ~ '^967[0-9]{2}$|^968[0-9]{2}$'),
  wants_founding       boolean not null default false,
  heard_from           text,
  referral_code        text not null unique default substr(md5(gen_random_uuid()::text), 1, 8),
  referred_by_code     text references waitlist_signups(referral_code) on delete set null,
  email_consent_at     timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  converted_member_id  uuid references members(id) on delete set null,
  constraint waitlist_21_plus check (date_of_birth <= (current_date - interval '21 years'))
);
create unique index waitlist_signups_email on waitlist_signups (lower(email));
create index waitlist_signups_referred_by on waitlist_signups (referred_by_code);

alter table waitlist_signups enable row level security;

-- Signups with their referral count, for picking Founding Member invites.
create view waitlist_ranked as
select w.*,
       (select count(*) from waitlist_signups r where r.referred_by_code = w.referral_code)::int as referrals
from waitlist_signups w
order by wants_founding desc, referrals desc, created_at;
alter view waitlist_ranked set (security_invoker = true);
