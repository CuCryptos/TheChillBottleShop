// Validates a budget CSV ("month,line,amount", month YYYY-MM, amount in dollars)
// in full before anything is written, so an import is all-or-nothing. Cells
// copied straight out of Excel or Google Sheets (tab-separated) work too.
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

const HEADER = ["month", "line", "amount"];

/** Tab if the first non-blank line has one (a spreadsheet paste), else semicolon if it has no comma, else comma. */
function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n|\r/).find((l) => l.trim() !== "") ?? "";
  if (first.includes("\t")) return "\t";
  if (first.includes(";") && !first.includes(",")) return ";";
  return ",";
}

/** Drops empty cells at the end of a row (a spreadsheet selection wider than the data). */
function trimTrailing(fields: string[]): string[] {
  let n = fields.length;
  while (n > 0 && fields[n - 1].trim() === "") n--;
  return fields.slice(0, n);
}

function describe(fields: string[]): string {
  const shown = fields.slice(0, 4).map((f) => f.trim()).join(" | ");
  return shown.length > 80 ? `${shown.slice(0, 77)}...` : shown;
}

export function parseBudgetCsv(text: string): BudgetImportResult {
  const clean = text.replace(/^﻿/, "");
  const records = parseCsv(clean, detectDelimiter(clean))
    .map((r) => ({ line: r.line, fields: trimTrailing(r.fields) }))
    .filter((r) => r.fields.length > 0);
  if (records.length === 0) return { ok: false, errors: [{ line: 1, message: "Paste a CSV with the header month,line,amount." }] };

  const [head, ...body] = records;
  // Only the first three header cells count, so a note beside the table is fine.
  const header = head.fields.slice(0, 3).map((f) => f.trim().toLowerCase());
  if (header.join(",") !== HEADER.join(",")) {
    return {
      ok: false,
      errors: [{
        line: head.line,
        message: `The first row must be the header "month,line,amount", but it reads "${describe(head.fields)}". Include the header row when you copy.`,
      }],
    };
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
    // Accounting format shows negatives as (160).
    const paren = /^\((.*)\)$/.exec(amount);
    let cents = paren ? parseDollars(paren[1]) : parseDollars(amount, { allowNegative: slug === "refunds" });
    if (paren && cents !== null) cents = slug === "refunds" ? -cents : null;
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
