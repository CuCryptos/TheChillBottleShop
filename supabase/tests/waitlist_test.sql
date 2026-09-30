-- Waitlist table tests. Run with supabase/tests/run.sh.

\set ON_ERROR_STOP on

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

insert into waitlist_signups (email, first_name, date_of_birth, island, postal_code, referral_code)
values ('kai@example.com', 'Kai', '1990-01-01', 'oahu', '96813', 'aaaaaaaa');

select pg_temp.assert_raises(
  $$insert into waitlist_signups (email, first_name, date_of_birth, island, postal_code)
    values ('KAI@example.com', 'Kai', '1990-01-01', 'oahu', '96813')$$,
  'waitlist_signups_email', 'duplicate email rejected regardless of case');

select pg_temp.assert_raises(
  $$insert into waitlist_signups (email, first_name, date_of_birth, island, postal_code)
    values ('teen@example.com', 'Teen', current_date - interval '20 years', 'maui', '96732')$$,
  'waitlist_21_plus', 'under-21 signup rejected');

select pg_temp.assert_raises(
  $$insert into waitlist_signups (email, first_name, date_of_birth, island, postal_code)
    values ('ca@example.com', 'Cal', '1990-01-01', 'oahu', '90210')$$,
  'postal_code', 'non-Hawaii ZIP rejected');

select pg_temp.assert_raises(
  $$insert into waitlist_signups (email, first_name, date_of_birth, island, postal_code, referred_by_code)
    values ('ref@example.com', 'Ref', '1990-01-01', 'oahu', '96815', 'zzzzzzzz')$$,
  'foreign key', 'unknown referral code rejected (app retries without it)');

insert into waitlist_signups (email, first_name, date_of_birth, island, postal_code, referred_by_code, wants_founding)
values ('friend@example.com', 'Leilani', '1992-03-04', 'kauai', '96746', 'aaaaaaaa', true);

do $$ begin
  if (select referrals from waitlist_ranked where email = 'kai@example.com') <> 1 then
    raise exception 'FAIL referral count';
  end if;
  raise notice 'ok  waitlist_ranked counts referrals';
end $$;

update waitlist_signups set confirmation_sent_at = now() where email = 'kai@example.com';
do $$ begin
  if (select confirmation_sent_at from waitlist_ranked where email = 'kai@example.com') is null then
    raise exception 'FAIL waitlist_ranked confirmation_sent_at';
  end if;
  raise notice 'ok  waitlist_ranked shows confirmation_sent_at';
end $$;

\echo 'All waitlist tests passed.'
