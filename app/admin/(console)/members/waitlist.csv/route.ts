import { hasAdminSession } from "@/lib/admin-auth";
import { toCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import { hawaiiToday } from "@/lib/validate";
import { rankedWaitlist, type WaitlistRow } from "../waitlist";

const PAGE_SIZE = 1000;

export async function GET() {
  if (!(await hasAdminSession())) return new Response("Unauthorized", { status: 401 });
  const supabase = db();
  if (!supabase) return new Response("Database not configured", { status: 503 });

  const rows: WaitlistRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await rankedWaitlist(supabase, from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("admin: waitlist export failed:", error);
      return new Response("Export failed", { status: 500 });
    }
    rows.push(...((data ?? []) as WaitlistRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const csv = toCsv(
    ["rank", "first_name", "email", "island", "zip", "wants_founding", "referrals", "signed_up_at", "confirmation_sent_at"],
    rows.map((r, i) => [i + 1, r.first_name, r.email, r.island, r.postal_code, r.wants_founding ? "yes" : "no", r.referrals, r.created_at, r.confirmation_sent_at]),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="waitlist-${hawaiiToday()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
