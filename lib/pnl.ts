// Monthly P&L: actuals vs budget with section subtotals. Amounts are cents;
// costs are positive numbers, refunds a negative revenue line.
import { PNL_LINES, PNL_SECTIONS, type PnlLine, type PnlSection } from "./pnl-lines.ts";

export type AmountRow = { line: string; amount_cents: number | string | null };

export type Figures = { actual: number; budget: number; variance: number; favorable: boolean };
export type PnlLineRow = Figures & { slug: PnlLine; label: string };
export type PnlSectionBlock = { key: PnlSection; label: string; lines: PnlLineRow[]; total: Figures };

export type Pnl = {
  sections: Record<PnlSection, PnlSectionBlock>;
  revenue: Figures;
  cogs: Figures;
  grossProfit: Figures;
  grossMargin: { actual: number | null; budget: number | null };
  opex: Figures;
  ebitda: Figures;
  other: Figures;
  netIncome: Figures;
};

/** Variance is actual − budget; favorable when income beats or costs come in under budget. */
export function figures(actual: number, budget: number, kind: "income" | "cost"): Figures {
  const variance = actual - budget;
  return { actual, budget, variance, favorable: kind === "income" ? variance >= 0 : variance <= 0 };
}

function sumBy(rows: readonly AmountRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const n = Number(r.amount_cents ?? 0);
    if (Number.isFinite(n)) out.set(r.line, (out.get(r.line) ?? 0) + n);
  }
  return out;
}

export function marginPct(profit: number, revenue: number): number | null {
  return revenue > 0 ? (profit / revenue) * 100 : null;
}

export function buildPnl(actualRows: readonly AmountRow[], budgetRows: readonly AmountRow[]): Pnl {
  const actual = sumBy(actualRows);
  const budget = sumBy(budgetRows);

  const block = (key: PnlSection): PnlSectionBlock => {
    const kind = key === "revenue" ? "income" : "cost";
    const lines = PNL_LINES.filter((l) => l.section === key).map((l) => ({
      slug: l.slug,
      label: l.label,
      ...figures(actual.get(l.slug) ?? 0, budget.get(l.slug) ?? 0, kind),
    }));
    const total = figures(
      lines.reduce((s, l) => s + l.actual, 0),
      lines.reduce((s, l) => s + l.budget, 0),
      kind,
    );
    return { key, label: PNL_SECTIONS[key], lines, total };
  };

  const sections = { revenue: block("revenue"), cogs: block("cogs"), opex: block("opex"), other: block("other") };
  const diff = (a: Figures, b: Figures) => figures(a.actual - b.actual, a.budget - b.budget, "income");

  const grossProfit = diff(sections.revenue.total, sections.cogs.total);
  const ebitda = diff(grossProfit, sections.opex.total);
  const netIncome = diff(ebitda, sections.other.total);

  return {
    sections,
    revenue: sections.revenue.total,
    cogs: sections.cogs.total,
    grossProfit,
    grossMargin: {
      actual: marginPct(grossProfit.actual, sections.revenue.total.actual),
      budget: marginPct(grossProfit.budget, sections.revenue.total.budget),
    },
    opex: sections.opex.total,
    ebitda,
    other: sections.other.total,
    netIncome,
  };
}
