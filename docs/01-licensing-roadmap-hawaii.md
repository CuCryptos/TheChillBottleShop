# Licensing Roadmap — Hawaii (City & County of Honolulu)

> **Not legal advice.** This is a working checklist for conversations with a Hawaii
> liquor-licensing attorney and the county liquor commission. Statute references
> must be checked against the current HRS Chapter 281 and the rules of the
> commission in the county where the shop will be licensed.

## 0. The blocking question: common ownership across tiers

The Chill Bottle Shop (retail) will buy from **Von Oster Beverage Co** (wholesale),
and both share an owner. Hawaii law restricts this directly:

- **HRS §281-42** makes it unlawful for a holder of a manufacturer's or
  **wholesale dealer's license** to induce a retail licensee's purchases by
  **acquiring or holding any interest in the retail licensee's license**, or in
  the real or personal property the retailer uses, unless the commission's rules
  allow it or a filed statement has not been disapproved.
- The same section **caps wholesaler credit to retailers at 30 days from invoice**,
  bars wholesalers from guaranteeing retailer loans, and requires cash or
  prepayment if a retailer is past due.

**What this means for the plan:** before spending on a lease, a website launch or
an application fee, get a written opinion on whether, and how, one owner can hold
both a Class 3 (wholesale) and a Class 4 (retail) interest in Hawaii. Questions for
counsel:

1. Does §281-42 bar common ownership outright, or only ownership used "to induce
   purchases"? How has the Honolulu Liquor Commission applied it?
2. If the Chill Bottle Shop buys **only** from Von Oster, is that an "inducement"
   problem? Would buying from several wholesalers change the analysis?
3. Can the conflict be fixed with structure (separate entities, separate
   ownership, a filed disclosure under §281-42), or does it need a different
   model altogether?
4. Does hopgrail.com promoting drops count as a wholesaler giving the retailer
   advertising (a thing of value)? Should the media site be owned separately or
   keep editorial distance?
5. Federal tied-house rules (FAA Act, 27 U.S.C. §205(b) and 27 CFR part 6)
   apply to the wholesaler. Does the planned relationship pass there too?

Build the website and member list while waiting on this answer. **Don't sell or
take payment for beer** until the retail license is issued and the ownership
question is settled.

## 1. Entity and tax setup

| Step | Agency | Notes |
|---|---|---|
| Form the retail entity (LLC/corp) | Hawaii DCCA, Business Registration Division | Keep it separate from Von Oster, whatever counsel decides on ownership. |
| General Excise Tax (GET) license | Hawaii Dept. of Taxation | Needed before any sale. Membership fees are likely GET-taxable too; confirm with a CPA. |
| EIN | IRS | |
| Liquor tax | Hawaii Dept. of Taxation | Liquor tax is normally paid upstream by the wholesaler/importer. Confirm the retailer owes nothing extra. |
| Federal | TTB | Retailers don't need a federal permit, but they must follow federal recordkeeping and tied-house rules. |

## 2. Retail liquor license (Class 4 — Retail Dealer)

In Honolulu, **Class 3 is wholesale** and **Class 4 is the retail dealer** license
(beer & wine or general). An online store still needs a **licensed physical
premises**: the license attaches to a location, and beer has to be received,
stored and released from there.

Plan for:

- **A premises**: a small warehouse or storefront where the beer is received, held
  cold and picked up. Check zoning for retail liquor sales before signing a lease,
  and make the lease contingent on license approval.
- **An application** to the liquor commission covering the premises, owners,
  officers and managers. Ownership disclosure is where the §281-42 issue will come
  up.
- **Public notice and hearing**, since new retail licenses usually require them.
  Neighbor or community objections can delay approval, so budget months, not
  weeks.
- **Manager/employee requirements**, such as a registered liquor manager and
  server/seller training if the county requires it.
- **Retail-only license type** if members can't drink on site. Tastings or events
  may need separate permits.

## 3. Rules that shape the website

Based on the Honolulu commission rules and HRS 281, confirm each with counsel:

| Rule | Product consequence |
|---|---|
| Retailers may **deliver to residences or businesses on a bona fide order**, with a **delivery receipt signed by a person verified to be of legal age**. | Delivery flow captures ID check + signature; store the proof. |
| Orders (phone/internet) must be **placed, removed from the premises and delivery initiated within permitted business hours**. | Delivery dispatch is time-gated in software. |
| **No drive-in / order-from-vehicle sales**; customers buying at the premises must enter it. | Pickup happens *inside* the licensed premises, not curbside, unless counsel confirms curbside is allowed. |
| Contracted delivery providers may act as the licensee's agent, but **the licensee keeps control of payment receipt**. | Stripe account is in the Chill Bottle Shop's name; any 3PL is only an agent. |
| Minimum age 21, and no sales to intoxicated persons. | Age gate at signup, ID verification at signup **and** at hand-off. |
| **Shipping via common carrier / interstate** isn't part of this plan. | Launch serves Hawaii addresses only, with Oahu first. |

## 4. Buying from Von Oster

- Written price list with the same terms offered to every retailer. Keep it
  arm's-length, whatever the ownership outcome.
- **Pay every invoice within 30 days** (HRS §281-42). Track this in the system.
- The retailer doesn't **own** beer until it's invoiced and delivered to the
  licensed premises. Members hold **reservations (allocations)** before that, and
  the sale happens after arrival (see the product spec).

## 5. Suggested sequence

1. Engage a Hawaii liquor attorney and resolve §281-42 (**gate**).
2. Form the entity, get GET and EIN, open a bank account.
3. Find premises, check zoning, sign a license-contingent lease.
4. File the Class 4 application and go through notice and hearing.
5. Meanwhile, launch the **waitlist / founding-member** site: no beer sales and no
   beer-linked payments.
6. License issued: turn on allocations and payments, then run the first drop to
   founding members.
7. Add local delivery once the pickup flow is working well.

## Sources

- HRS §281-42 (Manufacturers and wholesale dealers, special restrictions):
  https://www.capitol.hawaii.gov/hrscurrent/Vol05_Ch0261-0319/HRS0281/HRS_0281-0042.htm
- HRS Chapter 281 as published by the Honolulu Liquor Commission:
  https://www.honolulu.gov/liq/wp-content/uploads/sites/9/2024/04/HRS_281_072018_Website.pdf
- Rules of the Liquor Commission, City & County of Honolulu:
  https://www.honolulu.gov/liq/wp-content/uploads/sites/9/2024/01/LIQ_Rule_Book_Rev_03-2018_Print_012023.pdf
- 2020 wholesaler letter to the Governor discussing §281-42's purpose:
  https://data.capitol.hawaii.gov/committeefiles/special/SCOVID/GOVERNOR/2020-04-07%20LETTER%20to%20Governor%20Ige%20(Liquor%20Wholesalers%20&%20Distributors)%20%5Brev%5D.pdf
