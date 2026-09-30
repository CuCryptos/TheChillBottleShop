import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type WaitlistRow = {
  first_name: string; email: string; island: string; postal_code: string; wants_founding: boolean;
  referrals: number; created_at: string; confirmation_sent_at: string | null;
};

export const WAITLIST_COLUMNS = "first_name, email, island, postal_code, wants_founding, referrals, created_at, confirmation_sent_at";

// Invite order, as in the waitlist_ranked view: Founding interest, referrals, signup date.
export function rankedWaitlist(supabase: SupabaseClient, from: number, to: number) {
  return supabase.from("waitlist_ranked").select(WAITLIST_COLUMNS)
    .order("wants_founding", { ascending: false })
    .order("referrals", { ascending: false })
    .order("created_at")
    .order("id")
    .range(from, to);
}
