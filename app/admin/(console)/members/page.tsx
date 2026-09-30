import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { MEMBERSHIP_STATUSES, label } from "@/lib/db-enums";
import { formatHawaii } from "@/lib/hawaii-time";
import { countNoShows, subtractInterval } from "@/lib/no-shows";
import { ISLANDS, type Island } from "@/lib/validate";
import { DbMissing, Flag, Flash, LoadError, type SearchParams } from "../../ui";
import { setMembershipStatus } from "./actions";
import { rankedWaitlist, type WaitlistRow } from "./waitlist";

const WAITLIST_SHOWN = 500;
const LIVE = ["pending", "active", "past_due"];

type Membership = { id: string; tier_code: string; status: string; starts_at: string };
type Member = { id: string; full_name: string; email: string; id_verified_at: string | null; memberships: Membership[] };

export default async function Members({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const params = await searchParams;
  const supabase = db();
  if (!supabase) return (<><h1>Members</h1><DbMissing /></>);

  const [waitlist, total, members, tiers, policy] = await Promise.all([
    rankedWaitlist(supabase, 0, WAITLIST_SHOWN - 1),
    supabase.from("waitlist_signups").select("id", { count: "exact", head: true }),
    supabase.from("members").select("id, full_name, email, id_verified_at, memberships(id, tier_code, status, starts_at)").order("full_name"),
    supabase.from("membership_tiers").select("code, name"),
    supabase.from("allocation_policy").select("no_show_window, no_show_limit").single(),
  ]);
  const failed = [waitlist, total, members, tiers, policy].find((r) => r.error);
  if (failed) return (<><h1>Members</h1><Flash params={params} /><LoadError what="members" error={failed.error} /></>);

  const noShowWindow = String(policy.data?.no_show_window ?? "365 days");
  const limit = Number(policy.data?.no_show_limit ?? 2);
  const cutoff = subtractInterval(new Date(), noShowWindow) ?? new Date(Date.now() - 365 * 86_400_000);
  const forfeits = await supabase.from("reservations").select("member_id, forfeited_at")
    .eq("status", "forfeited").gt("forfeited_at", cutoff.toISOString());
  if (forfeits.error) return (<><h1>Members</h1><LoadError what="no-shows" error={forfeits.error} /></>);
  const noShows = countNoShows((forfeits.data ?? []) as { member_id: string; forfeited_at: string }[], cutoff);

  const tierName = new Map(((tiers.data ?? []) as { code: string; name: string }[]).map((t) => [t.code, t.name]));
  const waitRows = (waitlist.data ?? []) as WaitlistRow[];
  const memberRows = (members.data ?? []) as Member[];

  return (
    <>
      <h1>Members</h1>
      <Flash params={params} />

      <section className="admin-section">
        <div className="section-head">
          <h2>Waitlist <span className="muted">({total.count ?? 0})</span></h2>
          <a className="button button-small button-ghost" href="/admin/members/waitlist.csv" download>Export CSV</a>
        </div>
        <p className="muted small">Invite order: Founding interest first, then referrals, then signup date.{(total.count ?? 0) > WAITLIST_SHOWN && ` Showing the first ${WAITLIST_SHOWN}; the CSV has everyone.`}</p>
        {waitRows.length === 0 ? <p className="muted">Nobody has signed up yet.</p> : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th className="num">#</th><th>Name</th><th>Email</th><th>Island</th><th>ZIP</th><th>Founding</th><th className="num">Referrals</th><th>Signed up</th><th>Confirmation sent</th></tr></thead>
              <tbody>
                {waitRows.map((w, i) => (
                  <tr key={w.email}>
                    <td className="num">{i + 1}</td>
                    <td>{w.first_name}</td>
                    <td>{w.email}</td>
                    <td>{ISLANDS[w.island as Island] ?? w.island}</td>
                    <td>{w.postal_code}</td>
                    <td>{w.wants_founding ? "Yes" : "—"}</td>
                    <td className="num">{w.referrals}</td>
                    <td>{formatHawaii(w.created_at)}</td>
                    <td>{w.confirmation_sent_at ? formatHawaii(w.confirmation_sent_at) : <span className="warn">Not sent</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-section">
        <h2>Members <span className="muted">({memberRows.length})</span></h2>
        <p className="muted small">No-shows are forfeited orders in the last {noShowWindow}; {limit} or more loses early access.</p>
        {memberRows.length === 0 ? <p className="muted">No members yet.</p> : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Name</th><th>Email</th><th>Tier</th><th>Membership</th><th>ID verified</th><th className="num">No-shows</th></tr></thead>
              <tbody>
                {memberRows.map((m) => {
                  const ms = [...m.memberships].sort((a, b) =>
                    Number(LIVE.includes(b.status)) - Number(LIVE.includes(a.status)) || b.starts_at.localeCompare(a.starts_at));
                  const current = ms[0];
                  const n = noShows.get(m.id) ?? 0;
                  return (
                    <tr key={m.id}>
                      <td>{m.full_name}</td>
                      <td>{m.email}</td>
                      <td>{current ? tierName.get(current.tier_code) ?? current.tier_code : "—"}</td>
                      <td>
                        {current ? (
                          <form action={setMembershipStatus} className="inline-form">
                            <input type="hidden" name="membership_id" value={current.id} />
                            <select name="status" defaultValue={current.status} aria-label={`Membership status for ${m.full_name}`}>
                              {MEMBERSHIP_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                            </select>
                            <button className="button button-small button-ghost" type="submit">Set</button>
                          </form>
                        ) : "No membership"}
                      </td>
                      <td><Flag ok={m.id_verified_at !== null} /></td>
                      <td className={`num ${n >= limit ? "bad" : ""}`}>{n}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
