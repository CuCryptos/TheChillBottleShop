import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { ALLOCATION_MODES, DROP_STATUSES, label } from "@/lib/db-enums";
import { formatHawaii } from "@/lib/hawaii-time";
import { ConfirmButton } from "../../ConfirmButton";
import { DbMissing, Flag, Flash, LoadError, Money, type SearchParams } from "../../ui";
import { addItem, createDrop, forfeitUnclaimed, receiveItem, runDraw, setDropStatus } from "./actions";

type Drop = {
  id: string; title: string; slug: string; status: string; allocation_mode: string;
  reservation_opens_at: string; reservation_closes_at: string; pickup_hold_days: number;
  drawn_at: string | null; purchase_orders: { po_number: string } | null;
};
type Item = {
  drop_item_id: string; drop_id: string; brewery: string; product_name: string;
  planned_qty: number; received_qty: number | null; allocated_qty: number; unallocated_qty: number;
  waitlisted_qty: number; entered_qty: number; fully_allocated: boolean; guarantee_covered: boolean;
};
type ItemExtra = { id: string; price_cents: number; per_member_limit: number | null };
type Product = { id: string; brewery: string; name: string; package: string };
type Po = { id: string; po_number: string };

export default async function Drops({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const params = await searchParams;
  const supabase = db();
  if (!supabase) return (<><h1>Drops</h1><DbMissing /></>);

  const [drops, items, extras, products, pos] = await Promise.all([
    supabase.from("drops").select("id, title, slug, status, allocation_mode, reservation_opens_at, reservation_closes_at, pickup_hold_days, drawn_at, purchase_orders(po_number)")
      .order("reservation_opens_at", { ascending: false }),
    supabase.from("drop_item_allocation_status").select("*").order("brewery"),
    supabase.from("drop_items").select("id, price_cents, per_member_limit"),
    supabase.from("products").select("id, brewery, name, package").order("brewery").order("name"),
    supabase.from("purchase_orders").select("id, po_number").neq("status", "cancelled").order("created_at", { ascending: false }),
  ]);
  const failed = [drops, items, extras, products, pos].find((r) => r.error);
  if (failed) return (<><h1>Drops</h1><Flash params={params} /><LoadError what="drops" error={failed.error} /></>);

  const itemRows = (items.data ?? []) as Item[];
  const extra = new Map(((extras.data ?? []) as ItemExtra[]).map((e) => [e.id, e]));
  const productRows = (products.data ?? []) as Product[];
  const now = Date.now();

  return (
    <>
      <h1>Drops</h1>
      <Flash params={params} />

      <details className="admin-panel">
        <summary>New drop</summary>
        <form action={createDrop} className="admin-form">
          <div className="field"><label htmlFor="title">Title</label><input id="title" name="title" required maxLength={120} /></div>
          <div className="field"><label htmlFor="slug">Slug</label><input id="slug" name="slug" required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="hazy-ipa-oct" /></div>
          <div className="field">
            <label htmlFor="allocation_mode">Allocation</label>
            <select id="allocation_mode" name="allocation_mode">
              {ALLOCATION_MODES.map((m) => <option key={m} value={m}>{m === "draw" ? "Draw (limited release)" : "First come (standard)"}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="opens_at">Reservations open <span className="hint">Hawaiʻi time</span></label><input id="opens_at" name="opens_at" type="datetime-local" required /></div>
          <div className="field"><label htmlFor="closes_at">Reservations close <span className="hint">Hawaiʻi time</span></label><input id="closes_at" name="closes_at" type="datetime-local" required /></div>
          <div className="field"><label htmlFor="pickup_hold_days">Pickup hold (days)</label><input id="pickup_hold_days" name="pickup_hold_days" type="number" min={1} max={60} defaultValue={7} required /></div>
          <div className="field">
            <label htmlFor="purchase_order_id">Purchase order <span className="hint">optional</span></label>
            <select id="purchase_order_id" name="purchase_order_id" defaultValue="">
              <option value="">None</option>
              {((pos.data ?? []) as Po[]).map((p) => <option key={p.id} value={p.id}>{p.po_number}</option>)}
            </select>
          </div>
          <div className="admin-form-actions"><button className="button button-small" type="submit">Create drop</button></div>
        </form>
      </details>

      {((drops.data ?? []) as unknown as Drop[]).length === 0 && <p className="muted">No drops yet.</p>}

      {((drops.data ?? []) as unknown as Drop[]).map((d) => {
        const mine = itemRows.filter((i) => i.drop_id === d.id);
        const closed = new Date(d.reservation_closes_at).getTime() <= now;
        return (
          <section key={d.id} className="admin-card">
            <div className="admin-card-head">
              <div>
                <h2>{d.title}</h2>
                <p className="muted small">
                  /{d.slug} · {label(d.allocation_mode)} · {formatHawaii(d.reservation_opens_at)} → {formatHawaii(d.reservation_closes_at)} HST
                  · hold {d.pickup_hold_days} days{d.purchase_orders ? ` · ${d.purchase_orders.po_number}` : ""}
                  {d.drawn_at ? ` · drawn ${formatHawaii(d.drawn_at)}` : ""}
                </p>
              </div>
              <span className="badge">{label(d.status)}</span>
            </div>

            <div className="admin-actions">
              <form action={setDropStatus} className="inline-form">
                <input type="hidden" name="drop_id" value={d.id} />
                <select name="status" defaultValue={d.status} aria-label="Status">
                  {DROP_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                </select>
                <button className="button button-small button-ghost" type="submit">Set status</button>
              </form>
              {d.allocation_mode === "draw" && !d.drawn_at && (
                <form action={runDraw} className="inline-form">
                  <input type="hidden" name="drop_id" value={d.id} />
                  {closed
                    ? <ConfirmButton message={`Run the draw for “${d.title}”? This can only be done once.`}>Run draw</ConfirmButton>
                    : <span className="muted small">Draw available after reservations close</span>}
                </form>
              )}
            </div>

            {mine.length > 0 && (
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Item</th><th className="num">Price</th><th className="num">Limit</th><th className="num">Planned</th>
                      <th className="num">Received</th><th className="num">Allocated</th><th className="num">Left</th>
                      <th className="num">Waitlist</th><th className="num">Entries</th><th>Full</th><th>Founding covered</th><th>Receive</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {mine.map((i) => {
                      const x = extra.get(i.drop_item_id);
                      return (
                        <tr key={i.drop_item_id}>
                          <td>{i.brewery} — {i.product_name}</td>
                          <td className="num"><Money cents={x?.price_cents} /></td>
                          <td className="num">{x?.per_member_limit ?? "tier"}</td>
                          <td className="num">{i.planned_qty}</td>
                          <td className="num">{i.received_qty ?? "—"}</td>
                          <td className="num">{i.allocated_qty}</td>
                          <td className="num">{i.unallocated_qty}</td>
                          <td className="num">{i.waitlisted_qty}</td>
                          <td className="num">{i.entered_qty}</td>
                          <td><Flag ok={i.fully_allocated} /></td>
                          <td><Flag ok={i.guarantee_covered} /></td>
                          <td>
                            {i.received_qty === null ? (
                              <form action={receiveItem} className="inline-form">
                                <input type="hidden" name="drop_item_id" value={i.drop_item_id} />
                                <input name="received_qty" type="number" min={0} defaultValue={i.planned_qty} required aria-label="Units received" className="qty" />
                                <ConfirmButton message="Record this count as received? Short shipments bump the newest allocations to the waitlist." className="button button-small button-ghost">Receive</ConfirmButton>
                              </form>
                            ) : <span className="muted small">Received</span>}
                          </td>
                          <td>
                            {i.received_qty !== null && (
                              <form action={forfeitUnclaimed}>
                                <input type="hidden" name="drop_item_id" value={i.drop_item_id} />
                                <ConfirmButton message={`Forfeit orders not picked up within ${d.pickup_hold_days} days? Refunds are recorded and the waitlist is promoted.`} className="button button-small button-ghost">Forfeit unclaimed</ConfirmButton>
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

            <details className="admin-panel">
              <summary>Add an item</summary>
              <form action={addItem} className="admin-form">
                <input type="hidden" name="drop_id" value={d.id} />
                <div className="field field-wide">
                  <label htmlFor={`product-${d.id}`}>Existing product</label>
                  <select id={`product-${d.id}`} name="product_id" defaultValue="">
                    <option value="">New product (fill in below)</option>
                    {productRows.map((p) => <option key={p.id} value={p.id}>{p.brewery} — {p.name} ({p.package})</option>)}
                  </select>
                </div>
                <div className="field"><label htmlFor={`brewery-${d.id}`}>Brewery</label><input id={`brewery-${d.id}`} name="brewery" maxLength={120} /></div>
                <div className="field"><label htmlFor={`name-${d.id}`}>Name</label><input id={`name-${d.id}`} name="name" maxLength={120} /></div>
                <div className="field"><label htmlFor={`style-${d.id}`}>Style</label><input id={`style-${d.id}`} name="style" maxLength={80} /></div>
                <div className="field"><label htmlFor={`abv-${d.id}`}>ABV %</label><input id={`abv-${d.id}`} name="abv" inputMode="decimal" maxLength={6} /></div>
                <div className="field"><label htmlFor={`package-${d.id}`}>Package</label><input id={`package-${d.id}`} name="package" maxLength={80} placeholder="4-pack 16oz cans" /></div>
                <div className="field"><label htmlFor={`planned-${d.id}`}>Planned qty</label><input id={`planned-${d.id}`} name="planned_qty" type="number" min={0} required /></div>
                <div className="field"><label htmlFor={`price-${d.id}`}>Price ($, before GET)</label><input id={`price-${d.id}`} name="price" inputMode="decimal" required placeholder="24.00" /></div>
                <div className="field"><label htmlFor={`limit-${d.id}`}>Per-member limit <span className="hint">blank = tier default</span></label><input id={`limit-${d.id}`} name="per_member_limit" type="number" min={1} max={100} /></div>
                <div className="admin-form-actions"><button className="button button-small" type="submit">Add item</button></div>
              </form>
            </details>
          </section>
        );
      })}
    </>
  );
}
