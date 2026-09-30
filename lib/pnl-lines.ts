// P&L line slugs, shared by the UI, the budget import and (by name) the
// finance migration's check constraints and the P&L spreadsheet.

export const PNL_SECTIONS = {
  revenue: "Revenue",
  cogs: "Cost of goods sold",
  opex: "Operating expenses",
  other: "Depreciation & interest",
} as const;
export type PnlSection = keyof typeof PNL_SECTIONS;

export const PNL_LINES = [
  { slug: "beer_sales", label: "Beer sales", section: "revenue" },
  { slug: "refunds", label: "Refunds", section: "revenue" },
  { slug: "membership_fees", label: "Membership fees", section: "revenue" },
  { slug: "beer_cogs", label: "Beer purchases (Von Oster)", section: "cogs" },
  { slug: "rent", label: "Rent", section: "opex" },
  { slug: "utilities", label: "Utilities", section: "opex" },
  { slug: "payroll", label: "Payroll", section: "opex" },
  { slug: "insurance", label: "Insurance", section: "opex" },
  { slug: "licenses", label: "Licenses & permits", section: "opex" },
  { slug: "software", label: "Software", section: "opex" },
  { slug: "payment_processing", label: "Payment processing", section: "opex" },
  { slug: "marketing", label: "Marketing", section: "opex" },
  { slug: "professional_fees", label: "Professional fees", section: "opex" },
  { slug: "delivery", label: "Delivery", section: "opex" },
  { slug: "supplies", label: "Supplies", section: "opex" },
  { slug: "other_opex", label: "Other operating", section: "opex" },
  { slug: "depreciation", label: "Depreciation", section: "other" },
  { slug: "interest", label: "Interest", section: "other" },
] as const satisfies readonly { slug: string; label: string; section: PnlSection }[];

export type PnlLine = (typeof PNL_LINES)[number]["slug"];
export type OpexLine = Extract<(typeof PNL_LINES)[number], { section: "opex" }>["slug"];

export const LINE_SLUGS: readonly PnlLine[] = PNL_LINES.map((l) => l.slug);
export const OPEX_LINES = PNL_LINES.filter((l) => l.section === "opex") as Extract<
  (typeof PNL_LINES)[number],
  { section: "opex" }
>[];

export function isPnlLine(value: string): value is PnlLine {
  return (LINE_SLUGS as readonly string[]).includes(value);
}

export function isOpexLine(value: string): value is OpexLine {
  return OPEX_LINES.some((l) => l.slug === value);
}

export function lineLabel(slug: string): string {
  return PNL_LINES.find((l) => l.slug === slug)?.label ?? slug;
}
