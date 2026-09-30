// No-show counting for the admin members list, mirroring member_no_shows() in
// SQL: forfeited reservations inside allocation_policy.no_show_window.

/**
 * Subtracts a Postgres interval as PostgREST returns it ("365 days",
 * "1 year 2 mons", "30 days 12:00:00") from `from`. Null if unparseable.
 */
export function subtractInterval(from: Date, interval: string): Date | null {
  const text = interval.trim();
  if (!text) return null;
  const units: Record<string, number> = { year: 0, mon: 0, day: 0, week: 0 };
  let rest = text.replace(/(-?\d+)\s+(years?|mons?|months?|days?|weeks?)\b/g, (_m, n: string, unit: string) => {
    const key = unit.startsWith("year") ? "year" : unit.startsWith("mon") ? "mon" : unit.startsWith("week") ? "week" : "day";
    units[key] += Number(n);
    return "";
  });
  let seconds = 0;
  rest = rest.replace(/(-)?(\d+):(\d{2})(?::(\d{2})(?:\.\d+)?)?/, (_m, neg: string, h: string, mi: string, s: string) => {
    seconds = (neg ? -1 : 1) * (Number(h) * 3600 + Number(mi) * 60 + Number(s ?? 0));
    return "";
  });
  if (rest.trim() !== "") return null;

  const d = new Date(from.getTime());
  d.setUTCFullYear(d.getUTCFullYear() - units.year, d.getUTCMonth() - units.mon);
  d.setUTCDate(d.getUTCDate() - units.day - units.week * 7);
  return new Date(d.getTime() - seconds * 1000);
}

/** Forfeits per member after `cutoff`. */
export function countNoShows(
  forfeits: readonly { member_id: string; forfeited_at: string | null }[],
  cutoff: Date,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const f of forfeits) {
    if (f.forfeited_at && new Date(f.forfeited_at) > cutoff) counts.set(f.member_id, (counts.get(f.member_id) ?? 0) + 1);
  }
  return counts;
}
