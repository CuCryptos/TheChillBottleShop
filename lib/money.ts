// Money is integer cents everywhere; dollars only at the edges (forms, display).

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "—";
  return USD.format(cents / 100);
}

const MAX_CENTS = 2_147_483_647; // Postgres integer

/**
 * Parses a dollar amount like "1,234.5", "$24" or "-3.00" into cents without
 * floating-point rounding. Returns null for anything else.
 */
export function parseDollars(input: string, { allowNegative = false } = {}): number | null {
  const s = input.trim().replace(/^\$/, "").replace(/^(-)\$/, "$1");
  const m = /^(-)?(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{1,2}))?$/.exec(s);
  if (!m || (m[2] === undefined && m[3] === undefined)) return null;
  if (m[1] && !allowNegative) return null;
  const whole = Number((m[2] ?? "0").replace(/,/g, ""));
  const cents = whole * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return m[1] && cents !== 0 ? -cents : cents;
}

/** Cents as a plain dollars string for CSV / form values, e.g. -1234 → "-12.34". */
export function centsToDollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
