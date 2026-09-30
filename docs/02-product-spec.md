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

## Launch phases

| Phase | Needs a license? | What's live |
|---|---|---|
| **0. Waitlist** | No | Landing page, email capture, "Founding Member" interest. No payments tied to beer. |
| **1. Membership + first drop** | Yes (Class 4 issued) | Paid membership, ID verification, reservations, payment on arrival, in-store pickup. |
| **2. Local delivery** | Yes | Oahu delivery with ID-checked signed receipt, dispatched within licensed hours. |
| **3. Extras** | Maybe | Lottery drops, member trading of unclaimed allocations, hopgrail.com integrations. |

## Membership

- **Tiers** (placeholder numbers; set them in `membership_tiers`):
  - *Founding*: limited count, highest priority, 48 h early access, higher per-drop limits.
  - *Member*: 24 h early access.
  - *Waitlist / Free*: can join waitlists and gets leftovers after the member windows close.
- The membership fee pays for **access**, not beer. Keeping the two charges separate
  keeps the membership outside liquor-sale timing rules. Confirm with counsel and
  a CPA (GET).
- **Must be 21+** and **ID-verified** (e.g. Stripe Identity, Persona or Veriff)
  before the first reservation, and the ID is checked again at hand-off.

## Drops and the allocation lifecycle

A **drop** is one beer release: one or more products (`drop_items`) tied to a
purchase order to Von Oster.

```
 draft ─▶ announced ─▶ reservations open ─▶ reservations closed ─▶ inbound ─▶ received ─▶ fulfilling ─▶ closed
                        (tier early access)   (PO quantities final)          (reconcile, charge)
```

Each member's **reservation** moves through:

```
requested ─┬─▶ allocated ──▶ charged ──▶ ready ──▶ fulfilled
           │       │            │          └──▶ forfeited (not picked up → back to pool)
           │       └──▶ cancelled (member or shortfall) → units go to the waitlist
           └─▶ waitlisted ──▶ allocated (when units free up)
```

Rules the database enforces (see `supabase/migrations`):

1. **No overselling.** Allocated units never exceed a drop item's planned quantity,
   or its received quantity once it arrives. Reservations take a row lock, so two
   members can't get the same last case.
2. **Tier windows.** A member can reserve once
   `reservation_opens_at - tier.early_access_hours` has passed, and not after
   `reservation_closes_at`.
3. **Per-member limits** apply per drop item.
4. **Eligibility.** Active membership, verified ID, age 21+, Hawaii address.
5. **Fully allocated before arrival.** The `drop_item_allocation_status` view shows
   planned vs. allocated vs. waitlisted for each item, so you can close the PO
   size to match demand before Von Oster ships.
6. **Arrival reconciliation.** `receive_drop_item()` records the actual count. If
   Von Oster ships short, the **newest** allocations go back to the waitlist first.
   If it ships over, the **oldest** waitlisted reservations get promoted.
7. **Unclaimed beer** is forfeited after the pickup window and goes back to the pool
   for waitlisted members.

## Payments

- **Membership:** Stripe Billing subscription (annual).
- **Beer:** the card is saved at reservation (Stripe SetupIntent, no charge) and
  **charged when the beer is received at the licensed premises and invoiced**.
  That way the shop only sells beer it actually has on hand, and nobody pays for a
  short-shipped case. A normal card authorization expires in about 7 days, which
  is too short for a PO lead time, so use a saved card rather than an auth hold.
- A failed charge gives the member 48 h to fix it before the units go to the
  waitlist.
- The Stripe account is in The Chill Bottle Shop's name (the licensee must control
  payment receipt).

## Fulfillment

- **Pickup:** scheduled windows at the licensed premises, inside the premises. Staff
  scan the member's QR code, check their ID, and record who handed over the beer.
- **Delivery (phase 2):** Oahu addresses only. Dispatch only within licensed
  hours. The recipient shows ID and signs, and the name and signature are stored
  on the fulfillment record.

## Paying Von Oster

Every purchase order stores the invoice date, amount and paid date. The
`purchase_orders_payment_due` view flags invoices approaching the **30-day limit**
in HRS §281-42.

## Proposed stack

| Concern | Choice | Why |
|---|---|---|
| Web app | Next.js on Vercel | Already connected, fast to build, good for drop-day traffic |
| Database/auth | Supabase (Postgres + Auth + RLS) | Already connected; row locks and SQL functions make overselling impossible |
| Payments | Stripe (Billing, SetupIntents, Identity) | Supports licensed alcohol sellers in the US |
| Email/SMS | Resend + Twilio (or Postmark) | Drop alerts, ready-for-pickup notices |

## Open questions for you

- Tier pricing, founding-member count, and per-drop limits.
- Drop model: first-come within tier windows (as built) or a **lottery**?
- Pickup location, meaning which premises will hold the Class 4 license.
- Beer only, or beer and wine (affects license type)?
