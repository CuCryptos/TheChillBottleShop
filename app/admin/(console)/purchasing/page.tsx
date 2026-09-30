import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { PO_STATUSES, label } from "@/lib/db-enums";
import { formatDate, formatHawaii } from "@/lib/hawaii-time";
import { ConfirmButton } from "../../ConfirmButton";
import { DbMissing, Flash, LoadError, Money, type SearchParams } from "../../ui";
import { createPo, markPaid, recordInvoice, setPoStatus } from "./actions";

type Po = {
  id: string; po_number: string; supplier: string; status: string; expected_arrival: string | null;
  invoice_number: string | null; invoice_date: string | null; invoice_total_cents: number | null; paid_at: string | null;
};
type Due = { id: string; pay_by: string; days_remaining: number };

export default async function Purchasing({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const params = await searchParams;
  const supabase = db();
  if (!supabase) return (<><h1>Purchasing</h1><DbMissing /></>);

  const [pos, due] = await Promise.all([
    supabase.from("purchase_orders").select("id, po_number, supplier, status, expected_arrival, invoice_number, invoice_date, invoice_total_cents, paid_at")
      .order("created_at", { ascending: false }),
    supabase.from("purchase_orders_payment_due").select("id, pay_by, days_remaining"),
  ]);
  const failed = [pos, due].find((r) => r.error);
  if (failed) return (<><h1>Purchasing</h1><Flash params={params} /><LoadError what="purchase orders" error={failed.error} /></>);

  const dueById = new Map(((due.data ?? []) as Due[]).map((d) => [d.id, d]));
  const rows = (pos.data ?? []) as Po[];
  const overdue = [...dueById.values()].filter((d) => d.days_remaining < 0).length;
  const soon = [...dueById.values()].filter((d) => d.days_remaining >= 0 && d.days_remaining <= 10).length;

  return (
    <>
      <h1>Purchasing</h1>
      <Flash params={params} />
      <p className="muted">
        Von Oster invoices must be paid within 30 days of the invoice date (HRS §281-42).
        {overdue > 0 && <strong className="bad"> {overdue} overdue.</strong>}
        {soon > 0 && <strong className="warn"> {soon} due within 10 days.</strong>}
      </p>

      <details className="admin-panel">
        <summary>New purchase order</summary>
        <form action={createPo} className="admin-form">
          <div className="field"><label htmlFor="po_number">PO number</label><input id="po_number" name="po_number" required maxLength={40} /></div>
          <div className="field"><label htmlFor="expected_arrival">Expected arrival</label><input id="expected_arrival" name="expected_arrival" type="date" /></div>
          <div className="admin-form-actions"><button className="button button-small" type="submit">Create PO</button></div>
        </form>
      </details>

      {rows.length === 0 ? <p className="muted">No purchase orders yet.</p> : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>PO</th><th>Status</th><th>Expected</th><th>Invoice</th><th className="num">Total</th><th>Pay by</th><th>Paid</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {rows.map((po) => {
                const d = dueById.get(po.id);
                const rowClass = d ? (d.days_remaining < 0 ? "row-bad" : d.days_remaining <= 10 ? "row-warn" : "") : "";
                return (
                  <tr key={po.id} className={rowClass}>
                    <td><strong>{po.po_number}</strong><br /><span className="muted small">{po.supplier}</span></td>
                    <td>
                      <form action={setPoStatus} className="inline-form">
                        <input type="hidden" name="id" value={po.id} />
                        <select name="status" defaultValue={po.status} aria-label={`Status of ${po.po_number}`}>
                          {PO_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                        </select>
                        <button className="button button-small button-ghost" type="submit">Set</button>
                      </form>
                    </td>
                    <td>{formatDate(po.expected_arrival)}</td>
                    <td>{po.invoice_number ? <>{po.invoice_number}<br /><span className="muted small">{formatDate(po.invoice_date)}</span></> : "—"}</td>
                    <td className="num"><Money cents={po.invoice_total_cents} /></td>
                    <td>
                      {d ? <>{formatDate(d.pay_by)}<br /><span className="small">{d.days_remaining < 0 ? `Overdue ${-d.days_remaining} days` : `${d.days_remaining} days left`}</span></> : "—"}
                    </td>
                    <td>{po.paid_at ? formatHawaii(po.paid_at) : "—"}</td>
                    <td>
                      {!po.paid_at && (
                        <details className="row-details">
                          <summary>{po.invoice_date ? "Edit invoice" : "Record invoice"}</summary>
                          <form action={recordInvoice} className="stack-form">
                            <input type="hidden" name="id" value={po.id} />
                            <input name="invoice_number" placeholder="Invoice #" required maxLength={60} defaultValue={po.invoice_number ?? ""} aria-label="Invoice number" />
                            <input name="invoice_date" type="date" required defaultValue={po.invoice_date ?? ""} aria-label="Invoice date" />
                            <input name="invoice_total" inputMode="decimal" placeholder="Total $" required aria-label="Invoice total in dollars"
                              defaultValue={po.invoice_total_cents !== null ? (po.invoice_total_cents / 100).toFixed(2) : ""} />
                            <button className="button button-small" type="submit">Save invoice</button>
                          </form>
                        </details>
                      )}
                      {po.invoice_date && !po.paid_at && (
                        <form action={markPaid}>
                          <input type="hidden" name="id" value={po.id} />
                          <ConfirmButton message={`Mark ${po.po_number} as paid today?`}>Mark paid</ConfirmButton>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
