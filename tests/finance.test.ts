import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBudgetCsv } from "../lib/budget-import.ts";
import { centsToDollars, formatCents, parseDollars } from "../lib/money.ts";
import { buildPnl } from "../lib/pnl.ts";
import { LINE_SLUGS, OPEX_LINES, PNL_LINES } from "../lib/pnl-lines.ts";
import { readFileSync } from "node:fs";

test("parses dollars to cents without float error", () => {
  assert.equal(parseDollars("24"), 2400);
  assert.equal(parseDollars("$1,234.5"), 123450);
  assert.equal(parseDollars("0.07"), 7);
  assert.equal(parseDollars("19.99"), 1999);
  assert.equal(parseDollars(".5"), 50);
  assert.equal(parseDollars(" 3000.00 "), 300000);
  assert.equal(parseDollars("-3.00"), null, "negative needs allowNegative");
  assert.equal(parseDollars("-3.00", { allowNegative: true }), -300);
  assert.equal(parseDollars("-$3", { allowNegative: true }), -300);
  for (const bad of ["", "abc", "1.234", "1,23", "1e3", "12,34.00", "$", ".", "99999999"]) {
    assert.equal(parseDollars(bad), null, bad);
  }
});

test("formats cents", () => {
  assert.equal(formatCents(123456), "$1,234.56");
  assert.equal(formatCents(-2160), "-$21.60");
  assert.equal(formatCents(null), "—");
  assert.equal(centsToDollars(-1205), "-12.05");
});

test("P&L lines match the migration's check constraints", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261004000000_finance.sql", import.meta.url), "utf8");
  const lists = [...sql.matchAll(/check \((?:category|line) in \(([^)]*)\)\)/g)].map((m) => [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
  assert.deepEqual(lists[0], OPEX_LINES.map((l) => l.slug), "expense categories");
  assert.deepEqual(lists[1], [...LINE_SLUGS], "budget lines");
  assert.equal(new Set(PNL_LINES.map((l) => l.label)).size, PNL_LINES.length, "labels are unique");
});

test("builds the P&L with subtotals, margin and variance", () => {
  const pnl = buildPnl(
    [
      { line: "beer_sales", amount_cents: 1_000_000 },
      { line: "refunds", amount_cents: "-20000" },
      { line: "membership_fees", amount_cents: 20000 },
      { line: "beer_cogs", amount_cents: 600_000 },
      { line: "rent", amount_cents: 200_000 },
      { line: "marketing", amount_cents: 50_000 },
      { line: "interest", amount_cents: 10_000 },
    ],
    [
      { line: "beer_sales", amount_cents: 900_000 },
      { line: "beer_cogs", amount_cents: 550_000 },
      { line: "rent", amount_cents: 200_000 },
      { line: "marketing", amount_cents: 40_000 },
    ],
  );
  assert.equal(pnl.revenue.actual, 1_000_000);
  assert.equal(pnl.revenue.budget, 900_000);
  assert.equal(pnl.revenue.variance, 100_000);
  assert.equal(pnl.revenue.favorable, true);
  assert.equal(pnl.cogs.variance, 50_000);
  assert.equal(pnl.cogs.favorable, false, "costs over budget are unfavorable");
  assert.equal(pnl.grossProfit.actual, 400_000);
  assert.equal(pnl.grossProfit.budget, 350_000);
  assert.equal(pnl.grossMargin.actual, 40);
  assert.ok(Math.abs((pnl.grossMargin.budget ?? 0) - 38.888) < 0.01);
  assert.equal(pnl.opex.actual, 250_000);
  assert.equal(pnl.ebitda.actual, 150_000);
  assert.equal(pnl.ebitda.budget, 110_000);
  assert.equal(pnl.netIncome.actual, 140_000);
  assert.equal(pnl.sections.opex.lines.length, 12);
  assert.equal(pnl.sections.revenue.lines.find((l) => l.slug === "refunds")?.actual, -20000);
  const marketing = pnl.sections.opex.lines.find((l) => l.slug === "marketing");
  assert.deepEqual(marketing && { v: marketing.variance, f: marketing.favorable }, { v: 10_000, f: false });
});

test("empty month has zeros and no margin", () => {
  const pnl = buildPnl([], []);
  assert.equal(pnl.netIncome.actual, 0);
  assert.equal(pnl.grossMargin.actual, null);
});

test("budget CSV imports valid rows", () => {
  const r = parseBudgetCsv("﻿Month, Line ,Amount\r\n2026-11,beer_sales,\"8,000.00\"\n\n2026-11,refunds,150\n2026-12,rent,$3000\n");
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.deepEqual(r.rows, [
      { month: "2026-11-01", line: "beer_sales", amount_cents: 800000 },
      { month: "2026-11-01", line: "refunds", amount_cents: -15000 },
      { month: "2026-12-01", line: "rent", amount_cents: 300000 },
    ]);
  }
});

test("budget CSV reports every bad line and imports nothing", () => {
  const r = parseBudgetCsv([
    "month,line,amount",
    "2026-11,beer_sales,100",
    "2026-13,rent,100",
    "2026-11,yacht,100",
    "2026-11,rent,-5",
    "2026-11,beer_sales,200",
    "2026-11,rent",
    "11/2026,rent,abc",
  ].join("\n"));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.deepEqual(r.errors.map((e) => e.line), [3, 4, 5, 6, 7, 8]);
    assert.match(r.errors[0].message, /month "2026-13"/i);
    assert.match(r.errors[1].message, /unknown line "yacht"/i);
    assert.match(r.errors[2].message, /zero or more/);
    assert.match(r.errors[3].message, /duplicate of line 2/i);
    assert.match(r.errors[4].message, /3 columns/);
    assert.match(r.errors[5].message, /month.*; amount/i);
  }
});

test("budget CSV needs the header and rows", () => {
  for (const [text, msg] of [["", /header/], ["month,amount\n2026-11,5", /header/], ["month,line,amount\n", /No budget rows/]] as const) {
    const r = parseBudgetCsv(text);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.errors[0].message, msg);
  }
});

test("budget import accepts cells copied from a spreadsheet", () => {
  // Excel/Sheets copy cells as tab-separated text; a wider selection adds empty
  // trailing cells, and the note beside the header is ignored.
  const r = parseBudgetCsv("month\tline\tamount\t\tPaste A:C (with header)\r\n2027-04\tbeer_sales\t8873\t\t\r\n2027-04\trefunds\t(160)\r\n2027-04\trent\t\"3,000\"\r\n");
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.deepEqual(r.rows, [
      { month: "2027-04-01", line: "beer_sales", amount_cents: 887_300 },
      { month: "2027-04-01", line: "refunds", amount_cents: -16_000 },
      { month: "2027-04-01", line: "rent", amount_cents: 300_000 },
    ]);
  }
  const semi = parseBudgetCsv("month;line;amount\n2027-04;rent;3000\n");
  assert.equal(semi.ok, true);
});

test("budget import explains a missing header and rejects stray columns", () => {
  const r = parseBudgetCsv("2027-04\tbeer_sales\t8873\n2027-04\trent\t3000\n");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errors[0].message, /reads "2027-04 \| beer_sales \| 8873"\. Include the header row/);

  const extra = parseBudgetCsv("month,line,amount\n2027-04,rent,3000,oops\n2027-04,beer_cogs,(10)\n");
  assert.equal(extra.ok, false);
  if (!extra.ok) {
    assert.match(extra.errors[0].message, /Expected 3 columns, found 4/);
    assert.match(extra.errors[1].message, /zero or more/);
  }
});
