import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { addMonths, formatDate, hawaiiMonth, isMonth, monthLabel, monthRange } from "@/lib/hawaii-time";
import { hawaiiToday } from "@/lib/validate";
import type { Figures, PnlSectionBlock } from "@/lib/pnl";
import { OPEX_LINES, lineLabel } from "@/lib/pnl-lines";
import { ConfirmButton } from "../../ConfirmButton";
import { DbMissing, Flash, LoadError, Money, param, type SearchParams } from "../../ui";
import { addExpense, deleteExpense } from "./actions";
import { BudgetImport } from "./BudgetImport";
import { loadPnl } from "./data";

type Expense = { id: string; incurred_on: string; category: string; vendor: string | null; description: string | null; amount_cents: number };

function Row({ name, f, strong, indent }: { name: string; f: Figures; strong?: boolean; indent?: boolean }) {
  return (
    <tr className={strong ? "row-total" : undefined}>
      <th scope="row" className={indent ? "indent" : undefined}>{name}</th>
      <td className="num"><Money cents={f.actual} /></td>
      <td className="num"><Money cents={f.budget} /></td>
      <td className="num"><Money cents={f.variance} className={f.variance === 0 ? "" : f.favorable ? "good" : "bad"} /></td>
    </tr>
  );
}

function Section({ block }: { block: PnlSectionBlock }) {
  return (
    <>
      <tr className="row-section"><th scope="rowgroup" colSpan={4}>{block.label}</th></tr>
      {block.lines.map((l) => <Row key={l.slug} name={l.label} f={l} indent />)}
      <Row name={`Total ${block.label.toLowerCase()}`} f={block.total} strong />
    </>
  );
}

const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);

export default async function Finance({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const params = await searchParams;
  const requested = param(params, "month");
  const month = isMonth(requested) ? requested : hawaiiMonth();
  const supabase = db();

  const picker = (
    <div className="month-picker">
      <Link className="button button-small button-ghost" href={`/admin/finance?month=${addMonths(month, -1)}`} aria-label="Previous month">←</Link>
      <form method="get" className="inline-form">
        <input type="month" name="month" defaultValue={month} aria-label="Month" required />
        <button className="button button-small button-ghost" type="submit">Go</button>
      </form>
      <Link className="button button-small button-ghost" href={`/admin/finance?month=${addMonths(month, 1)}`} aria-label="Next month">→</Link>
    </div>
  );

  if (!supabase) return (<><h1>Finance</h1>{picker}<DbMissing /></>);

  const { start, end } = monthRange(month);
  const [result, expenses] = await Promise.all([
    loadPnl(supabase, month),
    supabase.from("expenses").select("id, incurred_on, category, vendor, description, amount_cents")
      .gte("incurred_on", start).lt("incurred_on", end).order("incurred_on").order("created_at"),
  ]);

  const today = hawaiiToday();
  const defaultDate = today.startsWith(month) ? today : start;

  return (
    <>
      <h1>Finance</h1>
      <Flash params={params} />
      {picker}

      <section className="admin-section">
        <h2>{monthLabel(month)} P&amp;L</h2>
        {"error" in result ? <LoadError what="the P&L" error={result.error} /> : (
          <div className="table-wrap">
            <table className="admin-table pnl">
              <thead><tr><th></th><th className="num">Actual</th><th className="num">Budget</th><th className="num">Variance</th></tr></thead>
              <tbody>
                <Section block={result.pnl.sections.revenue} />
                <Section block={result.pnl.sections.cogs} />
                <Row name="Gross profit" f={result.pnl.grossProfit} strong />
                <tr>
                  <th scope="row">Gross margin</th>
                  <td className="num">{pct(result.pnl.grossMargin.actual)}</td>
                  <td className="num">{pct(result.pnl.grossMargin.budget)}</td>
                  <td></td>
                </tr>
                <Section block={result.pnl.sections.opex} />
                <Row name="EBITDA" f={result.pnl.ebitda} strong />
                <Section block={result.pnl.sections.other} />
                <Row name="Net income" f={result.pnl.netIncome} strong />
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">
          Cash basis, Hawaiʻi months. Beer sales count when a card is charged on arrival; refunds when an unclaimed order is
          forfeited; membership fees when a membership starts; beer cost on the Von Oster invoice date. Hawaiʻi GET is
          collected on top of prices and is excluded from revenue. Depreciation and interest have no actuals source yet.
        </p>
      </section>

      <section className="admin-section">
        <h2>Expenses</h2>
        <form action={addExpense} className="admin-form">
          <input type="hidden" name="month" value={month} />
          <div className="field"><label htmlFor="incurred_on">Date</label><input id="incurred_on" name="incurred_on" type="date" required defaultValue={defaultDate} /></div>
          <div className="field">
            <label htmlFor="category">Category</label>
            <select id="category" name="category" required>
              {OPEX_LINES.map((l) => <option key={l.slug} value={l.slug}>{l.label}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="vendor">Vendor</label><input id="vendor" name="vendor" maxLength={120} /></div>
          <div className="field"><label htmlFor="description">Description</label><input id="description" name="description" maxLength={500} /></div>
          <div className="field"><label htmlFor="amount">Amount ($)</label><input id="amount" name="amount" inputMode="decimal" required placeholder="125.00" /></div>
          <div className="admin-form-actions"><button className="button button-small" type="submit">Add expense</button></div>
        </form>

        {expenses.error ? <LoadError what="expenses" error={expenses.error} /> : (expenses.data ?? []).length === 0 ? (
          <p className="muted">No expenses recorded for {monthLabel(month)}.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Date</th><th>Category</th><th>Vendor</th><th>Description</th><th className="num">Amount</th><th></th></tr></thead>
              <tbody>
                {((expenses.data ?? []) as Expense[]).map((e) => (
                  <tr key={e.id}>
                    <td>{formatDate(e.incurred_on)}</td>
                    <td>{lineLabel(e.category)}</td>
                    <td>{e.vendor ?? "—"}</td>
                    <td>{e.description ?? "—"}</td>
                    <td className="num"><Money cents={e.amount_cents} /></td>
                    <td>
                      <form action={deleteExpense}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="month" value={month} />
                        <ConfirmButton message="Delete this expense?" className="button button-small button-ghost">Delete</ConfirmButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-section">
        <h2>Import budget</h2>
        <p className="muted small">
          Paste CSV with the header <code>month,line,amount</code>, or copy columns A:C (header included) straight from
          the model&apos;s Budget Export tab: month as YYYY-MM, amount in dollars. Lines:{" "}
          <code>beer_sales</code>, <code>refunds</code> (stored negative), <code>membership_fees</code>, <code>beer_cogs</code>,{" "}
          {OPEX_LINES.map((l) => <span key={l.slug}><code>{l.slug}</code>, </span>)}
          <code>depreciation</code>, <code>interest</code>. Existing amounts for the same month and line are replaced; if any
          row is invalid nothing is imported.
        </p>
        <BudgetImport />
      </section>
    </>
  );
}
