"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { friendlyDbError } from "@/lib/admin-errors";
import { parseBudgetCsv, type BudgetImportError } from "@/lib/budget-import";
import { db } from "@/lib/db";
import { date, oneOf, optionalText, text, uuid } from "@/lib/form-fields";
import { hawaiiMonth, isMonth } from "@/lib/hawaii-time";
import { parseDollars } from "@/lib/money";
import { OPEX_LINES } from "@/lib/pnl-lines";
import { back } from "../../back";

const OPEX_SLUGS = OPEX_LINES.map((l) => l.slug);

function pageFor(form: FormData): string {
  const month = text(form, "month", 7);
  return `/admin/finance?month=${isMonth(month) ? month : hawaiiMonth()}`;
}

export async function addExpense(form: FormData) {
  await requireAdmin();
  const page = pageFor(form);
  const supabase = db() ?? back(page, "error", "Database not configured.");
  const incurredOn = date(form, "incurred_on");
  const category = oneOf(form, "category", OPEX_SLUGS);
  const amount = parseDollars(text(form, "amount", 20));
  if (!incurredOn) back(page, "error", "Enter the date of the expense.");
  if (!category) back(page, "error", "Choose a category.");
  if (amount === null) back(page, "error", "Enter the amount in dollars, e.g. 125.00.");

  const { error } = await supabase.from("expenses").insert({
    incurred_on: incurredOn, category, amount_cents: amount,
    vendor: optionalText(form, "vendor", 120), description: optionalText(form, "description", 500),
  });
  if (error) back(page, "error", friendlyDbError(error, "save the expense"));
  back(`/admin/finance?month=${incurredOn.slice(0, 7)}`, "ok", "Expense saved.");
}

export async function deleteExpense(form: FormData) {
  await requireAdmin();
  const page = pageFor(form);
  const supabase = db() ?? back(page, "error", "Database not configured.");
  const id = uuid(form, "id");
  if (!id) back(page, "error", "Unknown expense.");
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) back(page, "error", friendlyDbError(error, "delete the expense"));
  back(page, "ok", "Expense deleted.");
}

export type ImportState =
  | { status: "idle" }
  | { status: "invalid"; errors: BudgetImportError[]; csv: string }
  | { status: "failed"; message: string; csv: string }
  | { status: "imported"; count: number; months: string[] };

export async function importBudget(_prev: ImportState, form: FormData): Promise<ImportState> {
  await requireAdmin();
  const raw = form.get("csv");
  const csv = typeof raw === "string" ? raw : "";
  if (csv.length > 200_000) return { status: "failed", message: "That CSV is too large. Import it in smaller pieces.", csv: "" };
  const supabase = db();
  if (!supabase) return { status: "failed", message: "Database not configured.", csv };

  const parsed = parseBudgetCsv(csv);
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors.slice(0, 100), csv };

  // One upsert statement: every row is written, or none is.
  const { error } = await supabase.from("budget_lines").upsert(parsed.rows, { onConflict: "month,line" });
  if (error) return { status: "failed", message: friendlyDbError(error, "import the budget"), csv };
  refresh();
  const months = [...new Set(parsed.rows.map((r) => r.month.slice(0, 7)))].sort();
  return { status: "imported", count: parsed.rows.length, months };
}
