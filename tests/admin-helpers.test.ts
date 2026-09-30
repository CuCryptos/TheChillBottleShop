import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyDbError } from "../lib/admin-errors.ts";
import { csvCell, parseCsv, toCsv } from "../lib/csv.ts";
import { date, int, oneOf, uuid } from "../lib/form-fields.ts";
import { addMonths, hawaiiLocalToUtc, hawaiiMonth, isMonth, monthRange, utcToHawaiiLocal } from "../lib/hawaii-time.ts";
import { countNoShows, subtractInterval } from "../lib/no-shows.ts";

test("CSV cells are escaped and guarded against formula injection", () => {
  assert.equal(csvCell("Kai"), "Kai");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(3), "3");
  assert.equal(csvCell('say "aloha"'), '"say ""aloha"""');
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell("line\nbreak"), '"line\nbreak"');
  assert.equal(csvCell("=HYPERLINK(\"http://x\")"), '"\'=HYPERLINK(""http://x"")"');
  assert.equal(csvCell("+1"), "'+1");
  assert.equal(csvCell("-2"), "'-2");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("\tx"), "'\tx");
  assert.equal(toCsv(["a", "b"], [[1, "x,y"]]), 'a,b\r\n1,"x,y"\r\n');
});

test("CSV parsing handles quotes, CRLF and line numbers", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, ""y""",2\n\n"multi\nline",3'), [
    { line: 1, fields: ["a", "b"] },
    { line: 2, fields: ['x, "y"', "2"] },
    { line: 4, fields: ["multi\nline", "3"] },
  ]);
});

test("Hawaiʻi wall time converts to UTC (UTC−10, no DST)", () => {
  assert.equal(hawaiiLocalToUtc("2026-10-01T09:00"), "2026-10-01T19:00:00.000Z");
  assert.equal(hawaiiLocalToUtc("2026-12-31T20:30"), "2027-01-01T06:30:00.000Z");
  assert.equal(hawaiiLocalToUtc("2026-07-04T00:00"), "2026-07-04T10:00:00.000Z", "no daylight saving in summer");
  assert.equal(hawaiiLocalToUtc("2026-02-30T09:00"), null);
  assert.equal(hawaiiLocalToUtc("2026-10-01T24:00"), null);
  assert.equal(hawaiiLocalToUtc("tomorrow"), null);
  assert.equal(utcToHawaiiLocal("2027-01-01T06:30:00Z"), "2026-12-31T20:30");
});

test("Hawaiʻi months", () => {
  assert.equal(hawaiiMonth(new Date("2026-11-01T05:00:00Z")), "2026-10", "still Oct 31 in Honolulu");
  assert.equal(hawaiiMonth(new Date("2026-11-01T10:00:00Z")), "2026-11");
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.deepEqual(monthRange("2026-12"), { start: "2026-12-01", end: "2027-01-01" });
  assert.equal(isMonth("2026-11"), true);
  assert.equal(isMonth("2026-13"), false);
  assert.equal(isMonth("2026-1"), false);
});

test("form field readers reject junk", () => {
  const f = (o: Record<string, string>) => new Map(Object.entries(o)) as unknown as FormData;
  assert.equal(uuid(f({ id: "00000000-0000-0000-0000-0000000000A1" }), "id"), "00000000-0000-0000-0000-0000000000a1");
  assert.equal(uuid(f({ id: "1; drop table" }), "id"), null);
  assert.equal(int(f({ n: "5" }), "n", 0, 10), 5);
  assert.equal(int(f({ n: "5.5" }), "n"), null);
  assert.equal(int(f({ n: "-1" }), "n", 0), null);
  assert.equal(date(f({ d: "2026-02-29" }), "d"), null);
  assert.equal(date(f({ d: "2028-02-29" }), "d"), "2028-02-29");
  assert.equal(oneOf(f({ s: "open" }), "s", ["open", "closed"] as const), "open");
  assert.equal(oneOf(f({ s: "hacked" }), "s", ["open", "closed"] as const), null);
});

test("database errors become friendly messages", () => {
  assert.equal(friendlyDbError({ code: "P0001", message: "draw already run for this drop" }, "run the draw"),
    "Couldn't run the draw: Draw already run for this drop.");
  assert.equal(friendlyDbError({ code: "23505", message: 'duplicate key value violates unique constraint "drops_slug_key"' }, "create the drop"),
    "Couldn't create the drop: Another drop already uses that slug.");
  assert.equal(friendlyDbError({ code: "23514", message: 'new row violates check constraint "drops_window"' }, "create the drop"),
    "Couldn't create the drop: Reservations must close after they open.");
  assert.match(friendlyDbError({ code: "XX000", message: "internal" }, "do it"), /server logs/);
  assert.match(friendlyDbError(null, "do it"), /server logs/);
});

test("no-show window matches Postgres interval text", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  assert.equal(subtractInterval(now, "365 days")?.toISOString(), "2025-10-01T00:00:00.000Z");
  assert.equal(subtractInterval(now, "1 year")?.toISOString(), "2025-10-01T00:00:00.000Z");
  assert.equal(subtractInterval(now, "1 year 2 mons 3 days 04:00:00")?.toISOString(), "2025-07-28T20:00:00.000Z");
  assert.equal(subtractInterval(now, "P1Y"), null);
  const counts = countNoShows([
    { member_id: "a", forfeited_at: "2026-09-01T00:00:00Z" },
    { member_id: "a", forfeited_at: "2026-08-01T00:00:00Z" },
    { member_id: "a", forfeited_at: "2024-01-01T00:00:00Z" },
    { member_id: "b", forfeited_at: null },
  ], new Date("2025-10-01T00:00:00Z"));
  assert.equal(counts.get("a"), 2);
  assert.equal(counts.get("b"), undefined);
});
