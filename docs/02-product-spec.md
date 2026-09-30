# Product Spec — Member-First Beer Drops

## The idea in one line

Members reserve limited beer **before** it ships from Von Oster Beverage Co, so
every unit on the truck is already assigned to a named member when it arrives.

## How the three businesses fit together

```
hopgrail.com (media)  ──story, drop announcements──▶  The Chill Bottle Shop (retail, Class 4)
                                                         ▲         │
                                   purchase orders, invoices       │ pickup / local delivery
                                                         │         ▼
                                   Von Oster Beverage Co (wholesale, Class 3)     Members (21+, Hawaii)
```

The arrow from hopgrail.com depends on the tied-house answer in
[01-licensing-roadmap-hawaii.md](01-licensing-roadmap-hawaii.md).

## What the market research changed

The September 2026 research ([report](../reports/Beer%20drop%20market%20research%20Hawaii.md))
found no members-first craft beer service on Oʻahu. It also turned up one failure
this model has to avoid: Tavour charged $119/yr for early access, members still saw
beers sell out instantly, and the fee felt worthless. So this spec changes three
things:

1. **Founding membership guarantees beer, not just a head start.** A Founding
   member who reserves during their window always gets at least one unit of a
   standard drop.
2. **Limited drops use a draw, not a click race.** Oversubscribed releases take
   entries during a window, then run a random draw: Founding first, weighted by
   pickup history, one per member.
3. **Unclaimed orders have consequences.** Orders are held 7 days, then forfeited
   with a 90% refund. Two no-shows in a year cost a member their early access and
   put them at the back of draws.

The research also shaped the positioning: compete on **fair, fresh and curated**,
not on price or delivery speed.

## Launch phases

| Phase | Needs a license? | What's live |
|---|---|---|
| **0. Waitlist** | No | Landing page, email capture, "Founding Member" interest. No payments tied to beer. **(Live.)** |
| **1. Membership + first drop** | Yes (Class 4 issued) | Paid membership, ID verification, standard and draw drops, charge on arrival, in-store pickup. |
| **2. Local delivery** | Yes | Oʻahu delivery with an ID-checked, signed receipt, dispatched within licensed hours. |
| **3. Extras** | Maybe | Member trading of unclaimed allocations, hopgrail.com integrations, member events. |

## Membership

| | **Founding** | **Member** |
|---|---|---|
| Price (placeholder) | $150/yr | $75/yr |
| Cap | 100 | Sized to what Von Oster can supply |
| Standard drops | 48 h early access, plus a **guaranteed unit** if you reserve in the Founding window | 24 h early access |
| Per-item limit | 2 | 1 |
| Draw drops | Drawn before Members | Drawn after Founding |
| Renewal | Right of first refusal on your spot | Standard |

- The fee pays for **access and guarantees**, not beer; beer is always charged
  separately, on arrival. Don't bundle store credit into the fee until counsel
  clears it (Hawaiʻi gift-card rules, HRS 481B, may apply).
- **Must be 21+ and ID-verified** before the first reservation. Verify once at
  sign-up with a database check (e.g. AgeChecker, about $25/month plus $0.50 per
  pass), and scan the ID and capture a signature at every hand-off, which
  Honolulu requires anyway.
- Referral rewards give **access** (e.g. a place higher in the Founding queue),
  never free beer.

## Drops

A **drop** is one beer release: one or more products (`drop_items`) tied to a
purchase order to Von Oster. Each drop has an `allocation_mode`:

| | **Standard** (`first_come`) | **Limited** (`draw`) |
|---|---|---|
| Use for | Core and seasonal beer where supply roughly meets demand | Scarce barrel-aged, collab and whale releases |
| How it allocates | First-come within tier windows | Entries during the window, then one draw after it closes |
| Per member | Tier limit (Founding 2, Member 1) | 1 |
| Founding advantage | Guaranteed unit in the Founding window | Drawn first |

```
 draft ─▶ announced ─▶ reservations open ─▶ reservations closed ─▶ inbound ─▶ received ─▶ fulfilling ─▶ complete
                        (tier windows /          (draw runs here            (reconcile, charge,
                         draw entries)            for draw drops)             7-day pickup hold)
```

Each member's **reservation** moves through:

```
 entered ─(draw)─┬─▶ allocated ──▶ ready ──▶ fulfilled
                 │       │           └──▶ forfeited (not collected in 7 days → 90% refund, units to the waitlist)
                 │       └──▶ cancelled (by member) → units go to the waitlist
                 └─▶ waitlisted ──▶ allocated (when units free up)

 standard drops skip "entered": a reservation is allocated or waitlisted immediately.
 short shipments move the newest allocations back to "waitlisted".
```

### Rules the database enforces

See `supabase/migrations`; every rule below has a test in `supabase/tests`.

1. **No overselling.** Allocated units never exceed a drop item's planned
   quantity, or its received quantity once it arrives. Reservations take a row
   lock, so two members can't get the same last case.
2. **Tier windows.** A member can reserve once
   `reservation_opens_at - tier.early_access_hours` has passed, and not after
   `reservation_closes_at`.
3. **Founding guarantee.** During the Founding-only window, a Founding member can
   reserve more than one unit only if at least one unit is left for every Founding
   member who hasn't reserved yet. The `guarantee_covered` column in
   `drop_item_allocation_status` flags any standard drop with fewer units than
   active Founding members, so the order can be sized up before it ships.
4. **Draws.** `run_draw(drop_id)` runs once, after reservations close. It ranks
   entries by:
   1. members in good standing before members with repeated no-shows;
   2. guaranteed tiers (Founding) before others;
   3. a weighted random key: `random() ^ (1 + no-shows in the last year)`, so each
      recent no-show roughly halves a member's odds.

   Winners are allocated in rank order and everyone else is waitlisted in rank
   order. The seed is stored on the drop, so anyone can recompute the keys and
   check the result.
5. **Per-member limits** apply per drop item. Draw drops are always one per
   member.
6. **Eligibility.** Active membership, verified ID, age 21+, Hawaiʻi address.
7. **Fully allocated before arrival.** The `drop_item_allocation_status` view
   shows planned, allocated, waitlisted and entered quantities for each item, so
   you can size the purchase order to demand before Von Oster ships.
8. **Arrival reconciliation.** `receive_drop_item()` records the actual count. If
   Von Oster ships short, the **newest** allocations go back to the waitlist first.
   If it ships over, waitlisted members are promoted: in draw order for draw drops,
   oldest request first for standard drops.
9. **Charge on arrival.** `record_charge()` only works once the item has been
   received, and it marks the order ready for pickup.
10. **Pickup hold and forfeiture.** `forfeit_unclaimed()` releases ready orders
    older than the drop's `pickup_hold_days` (default 7). It records a refund due
    of `forfeit_refund_pct` (default 90%) and promotes the waitlist.
11. **No-show penalty.** A member with `no_show_limit` (default 2) forfeits
    within `no_show_window` (default 365 days) loses early access on standard
    drops and is drawn last on draw drops.

The percentages and limits live in the single-row `allocation_policy` table, so
they can be changed without a migration.

### Around the rules (app and ops, not the database)

- **Reminders** go out on day 1, day 4 and day 6 of the pickup hold.
- **One free switch to delivery** during the hold, once delivery launches.
- **Draw day:** results go out by email and SMS together. Nobody has to be online
  at a set minute.
- **Failed charge:** the member has 48 h to fix their card before the units go to
  the waitlist.

## What to source first

From the research. Confirm each item with what Von Oster can actually land.

| Priority | What | Why |
|---|---|---|
| 1 | Oʻahu local cans | Locals favor them; they're fresher and cheaper than mainland freight |
| 2 | West Coast IPA | "Back in a major way" in 2026 as drinkers tire of heavy hazies |
| 3 | Pilsners (incl. Italian pils) and session hazies (4–5.5%) | Lager is mature and growing; lighter beers suit Oʻahu's heat |
| 4 | One non-alcoholic line (e.g. Athletic) | Clearest growth category; 93% of NA buyers also buy alcohol |
| 5 | **Draw drop:** members-only Black Friday barrel-aged stouts | Bourbon County (Nov 27), Barrel-Aged Narwhal, Dogfish Head Xocolatl, if allocations are available |

Skip hemp-THC drinks (banned in Hawaiʻi) and keep pumpkin minimal. Print the
canned-on date on every listing and keep the cold chain.

## Payments

- **Membership:** annual subscription with clear terms, express consent and
  one-click cancellation (ROSCA and state auto-renewal laws).
- **Beer:** the card is saved at reservation or entry (a SetupIntent, with no
  charge) and **charged only when the beer is received** at the licensed premises.
  A normal card authorization expires in about 7 days, which is too short for a
  purchase-order lead time.
- **Processor:** Stripe lists alcohol as a restricted business: approval needs the
  license and can be declined. Apply as soon as the Class 4 license is issued, and
  keep Square as the fallback.
- The processor account is in The Chill Bottle Shop's name, because the licensee
  must control receipt of payment.

## Fulfillment

- **Pickup:** scheduled windows inside the licensed premises. Staff scan the
  member's QR code, check their ID, and record who handed the beer over.
  Curbside hand-off may be allowed under the delivery rules; confirm with counsel.
- **Delivery (phase 2):** Oʻahu addresses only, dispatched within licensed hours.
  The recipient shows ID and signs, and the name and signature are stored on the
  fulfillment record.

## Marketing

- **hopgrail.com** content feeds the waitlist, subject to the tied-house answer.
- **SMS for drop alerts** (about 12–14% click rates in food and beverage), plus
  automated email flows for welcome, reminders and results.
- **Meta ads** targeted 21+ with an age-gated landing page.
- **TikTok organic only.** Its US policy bans ads for alcohol retail, e-commerce
  and delivery.
- **Other channels:** Untappd for Business listings, and outreach to Oʻahu's
  military community.

## Paying Von Oster

Every purchase order stores the invoice date, amount and paid date. The
`purchase_orders_payment_due` view flags invoices approaching the **30-day limit**
in HRS §281-42.

## Proposed stack

| Concern | Choice | Why |
|---|---|---|
| Web app | Next.js on Vercel | Live; fast to build, handles drop-day traffic |
| Database/auth | Supabase (Postgres + Auth + RLS) | Live; row locks and SQL functions make overselling impossible |
| Payments | Stripe (Square fallback) | Card-on-file charge on arrival; alcohol needs Stripe approval |
| Age verification | AgeChecker at sign-up, ID scan at hand-off | Low friction online; required at hand-off |
| Email/SMS | Resend + Twilio (or Postmark) | Drop alerts, draw results, pickup reminders |

## Open questions

**For counsel before launch:**

- Can the shop take reservations and save cards for beer it hasn't received from
  the wholesaler yet?
- Are paid memberships with early access or guarantees allowed for a Class 4
  retailer?
- Tied-house exposure with Von Oster (HRS §281-42), which is also the likeliest
  source of scarce mainland beer.
- Whether SB976 (direct shipping) was enacted, and what HB1991 (2026 liquor tax)
  changes.
- Whether curbside counts as delivery, whether in-store tastings are allowed, and
  whether on-base delivery is restricted.

**For you:**

- Final tier prices and the Member cap.
- Which mainland allocations Von Oster can land for the Black Friday draw.
- Pickup location, i.e. which premises will hold the Class 4 license.
- Beer only, or beer and wine (this affects the license type)?
