import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { label } from "@/lib/db-enums";
import { formatDate, formatHawaii, hawaiiMonth, monthLabel } from "@/lib/hawaii-time";
import type { Figures } from "@/lib/pnl";
import { loadPnl } from "./finance/data";
import { DbMissing, Flag, LoadError, Money } from "../ui";

type DropRow = { id: string; title: string; status: string; allocation_mode: string; reservation_opens_at: string; reservation_closes_at: string };
type ItemFlags = { drop_id: string; fully_allocated: boolean; guarantee_covered: boolean };
type DueRow = { id: string; po_number: string; invoice_number: string | null; invoice_total_cents: number | null; pay_by: string; days_remaining: number };

export default async function Overview() {
  await requireAdmin();
  const supabase = db();
  if (!supabase) return (<><h1>Overview</h1><DbMissing /></>);

  const month = hawaiiMonth();
  const [waitlist, founding, tiers, active, drops, items, due, pnl] = await Promise.all([
    supabase.from("waitlist_signups").select("id", { count: "exact", head: true }),
    supabase.from("waitlist_signups").select("id", { count: "exact", head: true }).eq("wants_founding", true),
    supabase.from("membership_tiers").select("code, name").order("priority"),
    supabase.from("memberships").select("tier_code").eq("status", "active"),
    supabase.from("drops").select("id, title, status, allocation_mode, reservation_opens_at, reservation_closes_at")
      .in("status", ["announced", "open"]).order("reservation_opens_at"),
    supabase.from("drop_item_allocation_status").select("drop_id, fully_allocated, guarantee_covered")
      .in("drop_status", ["announced", "open"]),
    supabase.from("purchase_orders_payment_due").select("id, po_number, invoice_number, invoice_total_cents, pay_by, days_remaining")
      .lte("days_remaining", 10).order("pay_by"),
    loadPnl(supabase, month),
  ]);

  const failed = [waitlist, founding, tiers, active, drops, items, due].find((r) => r.error);
  if (failed) return (<><h1>Overview</h1><LoadError what="the overview" error={failed.error} /></>);

  const perTier = new Map<string, number>();
  for (const m of (active.data ?? []) as { tier_code: string }[]) perTier.set(m.tier_code, (perTier.get(m.tier_code) ?? 0) + 1);
  const flags = (items.data ?? []) as ItemFlags[];
  const dueRows = (due.data ?? []) as DueRow[];

  const totals: [string, Figures | undefined][] = "pnl" in pnl
    ? [["Revenue", pnl.pnl.revenue], ["Gross profit", pnl.pnl.grossProfit], ["Operating expenses", pnl.pnl.opex], ["EBITDA", pnl.pnl.ebitda]]
    : [];

  return (
    <>
      <h1>Overview</h1>

      <section className="stats">
        <div className="stat"><span className="stat-n">{waitlist.count ?? 0}</span><span>on the waitlist</span></div>
        <div className="stat"><span className="stat-n">{founding.count ?? 0}</span><span>want Founding</span></div>
        {((tiers.data ?? []) as { code: string; name: string }[]).map((t) => (
          <div className="stat" key={t.code}><span className="stat-n">{perTier.get(t.code) ?? 0}</span><span>active {t.name}s</span></div>
        ))}
      </section>

      <section className="admin-section">
        <h2>Announced &amp; open drops</h2>
        {(drops.data ?? []).length === 0 ? <p className="muted">No drops are announced or open.</p> : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Drop</th><th>Status</th><th>Mode</th><th>Opens</th><th>Closes</th><th>Fully allocated</th><th>Founding covered</th></tr></thead>
              <tbody>
                {((drops.data ?? []) as DropRow[]).map((d) => {
                  const mine = flags.filter((f) => f.drop_id === d.id);
                  return (
                    <tr key={d.id}>
                      <td><Link href="/admin/drops">{d.title}</Link></td>
                      <td>{label(d.status)}</td>
                      <td>{label(d.allocation_mode)}</td>
                      <td>{formatHawaii(d.reservation_opens_at)}</td>
                      <td>{formatHawaii(d.reservation_closes_at)}</td>
                      <td>{mine.length === 0 ? "No items" : <Flag ok={mine.every((f) => f.fully_allocated)} />}</td>
                      <td>{mine.length === 0 ? "—" : <Flag ok={mine.every((f) => f.guarantee_covered)} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-section">
        <h2>Invoices due within 10 days</h2>
        {dueRows.length === 0 ? <p className="muted">Nothing due in the next 10 days.</p> : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>PO</th><th>Invoice</th><th className="num">Total</th><th>Pay by</th><th>Status</th></tr></thead>
              <tbody>
                {dueRows.map((r) => (
                  <tr key={r.id} className={r.days_remaining < 0 ? "row-bad" : "row-warn"}>
                    <td><Link href="/admin/purchasing">{r.po_number}</Link></td>
                    <td>{r.invoice_number ?? "—"}</td>
                    <td className="num"><Money cents={r.invoice_total_cents} /></td>
                    <td>{formatDate(r.pay_by)}</td>
                    <td>{r.days_remaining < 0 ? `Overdue by ${-r.days_remaining} days` : `${r.days_remaining} days left`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-section">
        <h2>{monthLabel(month)} P&amp;L</h2>
        {"error" in pnl ? <LoadError what="the P&L" error={pnl.error} /> : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th></th><th className="num">Actual</th><th className="num">Budget</th><th className="num">Variance</th></tr></thead>
              <tbody>
                {totals.map(([name, f]) => f && (
                  <tr key={name}>
                    <th scope="row">{name}</th>
                    <td className="num"><Money cents={f.actual} /></td>
                    <td className="num"><Money cents={f.budget} /></td>
                    <td className="num"><Money cents={f.variance} className={f.favorable ? "good" : "bad"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p><Link href="/admin/finance">Full P&amp;L →</Link></p>
      </section>
    </>
  );
}
