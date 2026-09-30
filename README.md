# The Chill Bottle Shop

Online, member-first beer retail for Hawaii. The retail arm alongside
**hopgrail.com** (media) and **Von Oster Beverage Co** (wholesale).

Members reserve limited beer drops before the beer ships from Von Oster, so every
unit is assigned to a member by the time it arrives. Members then pick it up at
the licensed premises or get it delivered locally with an ID check.

## Start here

1. [Licensing roadmap (Hawaii)](docs/01-licensing-roadmap-hawaii.md): what to
   file, in what order, and the **cross-tier ownership question (HRS §281-42)**
   to settle with counsel first.
2. [Product spec](docs/02-product-spec.md): memberships, drops, the allocation
   lifecycle, payments and fulfillment.
3. [Database schema](supabase/migrations/): Postgres/Supabase tables plus the
   allocation engine: `reserve`, `run_draw`, `cancel_reservation`,
   `promote_waitlist`, `receive_drop_item`, `record_charge` and
   `forfeit_unclaimed`. Policy settings live in the `allocation_policy` table.
4. [Market research](reports/Beer%20drop%20market%20research%20Hawaii.md)
   (September 2026): Oʻahu competitors, trending styles, membership models and
   marketing, with the evidence quality flagged.

## The waitlist site (Phase 0)

A Next.js app (`app/`) with a 21+ age gate, a Hawaiʻi-only waitlist form, Founding
Member interest, and invite links. It doesn't sell or reserve anything.

```sh
cp .env.example .env.local   # add Supabase URL + service role key
npm install
npm run dev                  # http://localhost:3000
npm test && npm run typecheck
```

Without Supabase keys, `npm run dev` keeps signups in memory so you can try the
form. A production build refuses to accept signups until the keys are set.

**Deploying:** apply `supabase/migrations/` to your Supabase project, import this
repo into Vercel, set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
`NEXT_PUBLIC_SITE_URL`, and point your domain at it. To pick Founding invites,
use the `waitlist_ranked` view (Founding interest first, then referrals, then
signup date).

## Running the schema tests

Needs a Postgres 15+ server you can create databases on:

```sh
DATABASE_URL=postgres://postgres@localhost:5432/postgres supabase/tests/run.sh
```

Each test file runs in its own fresh database. The tests check:

- tier early-access windows, per-member limits, and the ID and age requirements;
- the Founding guarantee, draw ranking and reproducibility, and no-show penalties;
- waitlist promotion, the no-oversell guarantee and short-shipment reconciliation;
- charging on arrival, pickup forfeiture and refunds, and the inventory ledger;
- the 30-day wholesaler invoice window;
- that the public API roles can't call the allocation functions;
- the waitlist's age, ZIP, duplicate-email and referral rules.

## Status

Phase 0: planning, data model and waitlist site. Don't take any payment tied
to beer until the Class 4 retail license is issued.
