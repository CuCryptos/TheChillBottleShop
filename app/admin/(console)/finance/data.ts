import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPnl, type AmountRow, type Pnl } from "@/lib/pnl";

/** P&L for a "YYYY-MM" month: actuals from pnl_actuals_monthly, budget from budget_lines. */
export async function loadPnl(supabase: SupabaseClient, month: string): Promise<{ pnl: Pnl } | { error: { message?: string } }> {
  const monthDate = `${month}-01`;
  const [actuals, budget] = await Promise.all([
    supabase.from("pnl_actuals_monthly").select("line, amount_cents").eq("month", monthDate),
    supabase.from("budget_lines").select("line, amount_cents").eq("month", monthDate),
  ]);
  const error = actuals.error ?? budget.error;
  if (error) return { error };
  return { pnl: buildPnl((actuals.data ?? []) as AmountRow[], (budget.data ?? []) as AmountRow[]) };
}
