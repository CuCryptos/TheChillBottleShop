// Validates a budget CSV ("month,line,amount", month YYYY-MM, amount in dollars)
// in full before anything is written, so an import is all-or-nothing.
import { parseCsv } from "./csv.ts";
import { isMonth } from "./hawaii-time.ts";
import { parseDollars } from "./money.ts";
import { isPnlLine, type PnlLine } from "./pnl-lines.ts";

export type BudgetRow = { month: string; line: PnlLine; amount_cents: number };
export type BudgetImportError = { line: number; message: string };
export type BudgetImportResult =
  | { ok: true; rows: BudgetRow[] }
  | { ok: false; errors: BudgetImportError[] };

export const MAX_BUDGET_ROWS = 2000;

export function parseBudgetCsv(text: string): BudgetImportResult {
  const records = parseCsv(text.replace(/^﻿/, "")).filter((r) => r.fields.some((f) => f.trim() !== ""));
  if (records.length === 0) return { ok: false, errors: [{ line: 1, message: "Paste a CSV with the header month,line,amount." }] };

  const [head, ...body] = records;
  const header = head.fields.map((f) => f.trim().toLowerCase());
  if (header.join(",") !== "month,line,amount") {
    return { ok: false, errors: [{ line: head.line, message: 'The first row must be the header "month,line,amount".' }] };
  }
  if (body.length === 0) return { ok: false, errors: [{ line: head.line, message: "No budget rows after the header." }] };
  if (body.length > MAX_BUDGET_ROWS) {
    return { ok: false, errors: [{ line: body[MAX_BUDGET_ROWS].line, message: `At most ${MAX_BUDGET_ROWS} rows per import.` }] };
  }

  const errors: BudgetImportError[] = [];
  const rows: BudgetRow[] = [];
  const seen = new Map<string, number>();

  for (const { line, fields } of body) {
    if (fields.length !== 3) {
      errors.push({ line, message: `Expected 3 columns, found ${fields.length}.` });
      continue;
    }
    const [month, slug, amount] = fields.map((f) => f.trim());
    const problems: string[] = [];
    if (!isMonth(month)) problems.push(`month "${month}" must be YYYY-MM`);
    if (!isPnlLine(slug)) problems.push(`unknown line "${slug}"`);
    // Refunds are negative revenue; accept either sign and store it negative.
    let cents = parseDollars(amount, { allowNegative: slug === "refunds" });
    if (cents === null) problems.push(`amount "${amount}" must be a dollar amount${slug === "refunds" ? "" : " of zero or more"}`);
    else if (slug === "refunds") cents = -Math.abs(cents);

    if (problems.length === 0) {
      const key = `${month}|${slug}`;
      const first = seen.get(key);
      if (first !== undefined) problems.push(`duplicate of line ${first}`);
      else seen.set(key, line);
    }
    if (problems.length > 0) {
      const text = problems.join("; ");
      errors.push({ line, message: text[0].toUpperCase() + text.slice(1) + "." });
    } else {
      rows.push({ month: `${month}-01`, line: slug as PnlLine, amount_cents: cents as number });
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, rows };
}
