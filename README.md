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
3. [Database schema](supabase/migrations/20260930000000_initial_schema.sql):
   Postgres/Supabase tables plus the allocation engine (`reserve`,
   `cancel_reservation`, `promote_waitlist`, `receive_drop_item`).

## Running the schema tests

Needs a Postgres 15+ server you can create databases on:

```sh
DATABASE_URL=postgres://postgres@localhost:5432/postgres supabase/tests/run.sh
```

The tests check tier early-access windows, per-member limits, ID and age
requirements, waitlist promotion, the no-oversell guarantee, short-shipment
reconciliation, the inventory ledger, and the 30-day wholesaler invoice window.

## Status

Phase 0: planning and data model. Next up is the Next.js waitlist site. Don't
take any payment tied to beer until the Class 4 retail license is issued.
