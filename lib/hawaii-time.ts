// Hawaiʻi time helpers. Hawaiʻi Standard Time is UTC−10 all year (no daylight
// saving), so wall-clock conversion is a fixed offset.

export const HAWAII_TZ = "Pacific/Honolulu";
const OFFSET_MS = 10 * 60 * 60 * 1000;

/** A <input type="datetime-local"> value in Hawaiʻi time ("2026-10-01T09:00") → UTC ISO string. */
export function hawaiiLocalToUtc(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [1, 2, 3, 4, 5, 6].map((i) => Number(m[i] ?? 0));
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) {
    return null;
  }
  return new Date(wall + OFFSET_MS).toISOString();
}

/** A UTC instant → Hawaiʻi wall-clock "YYYY-MM-DDTHH:mm" (for datetime-local inputs). */
export function utcToHawaiiLocal(iso: string | Date): string {
  return new Date(new Date(iso).getTime() - OFFSET_MS).toISOString().slice(0, 16);
}

const DISPLAY = new Intl.DateTimeFormat("en-US", {
  timeZone: HAWAII_TZ,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatHawaii(iso: string | null | undefined): string {
  return iso ? DISPLAY.format(new Date(iso)) : "—";
}

const DATE_ONLY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

/** A calendar date ("2026-10-01") for display, without shifting it through a time zone. */
export function formatDate(date: string | null | undefined): string {
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? DATE_ONLY.format(new Date(`${date}T00:00:00Z`)) : "—";
}

/** The current Hawaiʻi month as "YYYY-MM". */
export function hawaiiMonth(now: Date = new Date()): string {
  return utcToHawaiiLocal(now).slice(0, 7);
}

/** Validates "YYYY-MM" (years 2000–2099). */
export function isMonth(value: string): boolean {
  return /^20\d{2}-(0[1-9]|1[0-2])$/.test(value);
}

/** "YYYY-MM" shifted by n months. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** First day of the month and of the following month, as dates, for range queries. */
export function monthRange(month: string): { start: string; end: string } {
  return { start: `${month}-01`, end: `${addMonths(month, 1)}-01` };
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" });

export function monthLabel(month: string): string {
  return MONTH_LABEL.format(new Date(`${month}-01T00:00:00Z`));
}
